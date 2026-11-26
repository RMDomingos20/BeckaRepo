pub use crate::policy::MAX_CONTENT_BYTES;
use crate::policy::{self, FileKind, MAX_ASSET_BYTES, MAX_FILES};
use crate::{
    analysis::analyze_relations,
    parser::{Extraction, Index},
    AnalysisResult, RepositoryFile,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    sync::Arc,
    time::UNIX_EPOCH,
};
use walkdir::WalkDir;

#[derive(Clone, Serialize)]
pub struct Progress {
    pub phase: &'static str,
    pub completed: usize,
    pub total: usize,
}

/// Metadata only: no source text is retained in a repository snapshot.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub revision: String,
    pub content_state: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySnapshot {
    pub schema_version: u32,
    pub snapshot_id: String,
    pub repository_id: String,
    pub name: String,
    pub files: Vec<FileEntry>,
    pub graph: AnalysisResult,
    pub warnings: Vec<String>,
    pub changes: ChangeSummary,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeSummary {
    pub parsed: usize,
    pub reused: usize,
    pub added: usize,
    pub removed: usize,
}

/// Derived relations only. Source text is never cached.
pub struct ScanCache {
    entries: HashMap<String, String>,
    index_files: Vec<(String, String)>,
    index: Arc<Index>,
    relations: HashMap<String, Arc<Extraction>>,
    index_valid: bool,
    parser_version: &'static str,
}

fn contributes_index(entry: &FileEntry) -> bool {
    let ext = entry
        .name
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    entry.content_state == "text"
        && (["yaml", "yml", "rs"].contains(&ext.as_str())
            || (entry.name == "meta.json" && entry.path.contains(".rsi/")))
}

#[derive(Serialize)]
pub struct TextContent {
    pub status: &'static str,
    pub revision: String,
    pub content: Option<String>,
}

static SNAPSHOT_COUNTER: AtomicU64 = AtomicU64::new(0);
fn revision(meta: &fs::Metadata) -> String {
    let time = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|t| t.as_nanos())
        .unwrap_or(0);
    format!("{}:{time}", meta.len())
}

pub fn canonical_root(path: &Path) -> Result<PathBuf, String> {
    let root = path
        .canonicalize()
        .map_err(|e| format!("Cannot open repository: {e}"))?;
    if policy::is_sensitive_path(&root.to_string_lossy()) {
        return Err("Repository is excluded by the sensitive-file policy".into());
    }
    if !root.is_dir() {
        return Err("Select a directory".into());
    }
    Ok(root)
}

/// Reads a single bounded file and checks size/mtime before and after reading.
/// This detects ordinary changes, not adversarial changes preserving metadata.
pub fn read_text(root: &Path, entry: &FileEntry) -> Result<TextContent, String> {
    read_bounded_text(root, entry, false)
}
fn read_bounded_text(
    root: &Path,
    entry: &FileEntry,
    package_metadata: bool,
) -> Result<TextContent, String> {
    let root = canonical_root(root)?;
    read_bounded_text_at(&root, entry, package_metadata)
}

// The scan owns a canonical root for its lifetime. Reuse it without reopening
// the root for every file; each target is still canonicalized and confined.
fn read_bounded_text_at(
    root: &Path,
    entry: &FileEntry,
    package_metadata: bool,
) -> Result<TextContent, String> {
    if policy::classify(&entry.path) != Some(FileKind::Text)
        && !(package_metadata && crate::packages::is_lock(&entry.path))
    {
        return Ok(TextContent {
            status: "unavailable",
            revision: entry.revision.clone(),
            content: None,
        });
    }
    let (path, _) = confined_entry_at(root, &entry.path)?;
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    let observed = revision(&meta);
    let empty = |status| TextContent {
        status,
        revision: observed.clone(),
        content: None,
    };
    if observed != entry.revision {
        return Ok(empty("changed"));
    }
    if meta.len() >= MAX_CONTENT_BYTES {
        return Ok(empty("too-large"));
    }
    let mut bytes = Vec::new();
    (&file)
        .take(MAX_CONTENT_BYTES)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let current = fs::metadata(&path).map_err(|e| e.to_string())?;
    if revision(&file.metadata().map_err(|e| e.to_string())?) != observed
        || revision(&current) != observed
    {
        return Ok(empty("changed"));
    }
    let text = String::from_utf8_lossy(&bytes).into_owned();
    if bytes.len() as u64 >= MAX_CONTENT_BYTES || text.len() as u64 >= MAX_CONTENT_BYTES {
        return Ok(empty("too-large"));
    }
    Ok(TextContent {
        status: "ready",
        revision: observed,
        content: Some(text),
    })
}

pub fn scan(
    root: &Path,
    progress: impl FnMut(Progress) -> Result<(), String>,
) -> Result<RepositorySnapshot, String> {
    scan_incremental(root, None, progress).map(|(snapshot, _)| snapshot)
}

pub fn scan_incremental(
    root: &Path,
    previous: Option<&ScanCache>,
    mut progress: impl FnMut(Progress) -> Result<(), String>,
) -> Result<(RepositorySnapshot, ScanCache), String> {
    // At most three inventories. A continuously changing tree is reported explicitly.
    for attempt in 0..3 {
        match scan_once(root, previous, &mut progress) {
            Err(error)
                if error.starts_with("Repository changed during analysis:") && attempt < 2 =>
            {
                progress(Progress {
                    phase: "retry",
                    completed: attempt + 1,
                    total: 3,
                })?;
            }
            result => return result,
        }
    }
    unreachable!()
}

fn scan_once(
    root: &Path,
    previous: Option<&ScanCache>,
    mut progress: impl FnMut(Progress) -> Result<(), String>,
) -> Result<(RepositorySnapshot, ScanCache), String> {
    let root = canonical_root(root)?;
    let mut files = Vec::new();
    let mut lock_files = Vec::new();
    let mut warnings = Vec::new();
    let walker = WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0
                || !e.file_type().is_dir()
                || !policy::should_skip_directory_at(&e.path().to_string_lossy())
        });
    for (i, entry) in walker.enumerate() {
        if i % 128 == 0 {
            progress(Progress {
                phase: "scan",
                completed: i,
                total: 0,
            })?;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                warnings.push(e.to_string());
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry
            .path()
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?
            .to_str()
            .ok_or("Non-UTF-8 repository path")?
            .replace('\\', "/");
        let dedicated_lock = crate::packages::is_lock(&path) && !policy::is_sensitive_path(&path);
        let Some(kind) =
            policy::classify(&path).or_else(|| dedicated_lock.then_some(FileKind::Text))
        else {
            continue;
        };
        let (_, meta) = match confined_entry_at(&root, &path) {
            Ok(entry) => entry,
            Err(e) => {
                warnings.push(e);
                continue;
            }
        };
        let file_entry = FileEntry {
            path,
            name: entry.file_name().to_string_lossy().into_owned(),
            size: meta.len(),
            revision: revision(&meta),
            content_state: if kind == FileKind::Asset {
                "asset"
            } else if meta.len() >= MAX_CONTENT_BYTES {
                "too-large"
            } else {
                "text"
            },
        };
        if dedicated_lock {
            lock_files.push(file_entry);
        } else {
            files.push(file_entry);
        }
        if files.len() + lock_files.len() > MAX_FILES {
            return Err(format!("Repository exceeds the {MAX_FILES} file limit"));
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    lock_files.sort_by(|a, b| a.path.cmp(&b.path));
    let metadata: Vec<_> = files
        .iter()
        .map(|f| RepositoryFile {
            path: f.path.clone(),
            name: f.name.clone(),
            size: f.size,
            content: None,
        })
        .collect();
    let entries: HashMap<_, _> = files
        .iter()
        .map(|f| (f.path.clone(), f.revision.clone()))
        .collect();
    let index_files: Vec<_> = files
        .iter()
        .filter(|f| contributes_index(f))
        .map(|f| (f.path.clone(), f.revision.clone()))
        .collect();
    // Paths, YAML/RSI identifiers and Rust declarations can change cross-file resolution.
    let reusable = previous.filter(|old| {
        old.index_valid
            && old.entries.len() == entries.len()
            && old.entries.keys().all(|path| entries.contains_key(path))
            && old.index_files == index_files
            && old.parser_version == crate::syntax::VERSION
            && old
                .index
                .config_dependencies()
                .all(|path| old.entries.get(path) == entries.get(path))
    });
    let index = if let Some(old) = reusable {
        old.index.clone()
    } else {
        let mut index = Index::new(&metadata);
        // First pass retains identifiers and compact Rust module declarations, never source/ASTs.
        for (i, entry) in files.iter().enumerate() {
            progress(Progress {
                phase: "read",
                completed: i,
                total: files.len(),
            })?;
            if !contributes_index(entry) {
                continue;
            }
            let content = scan_content(&root, entry, &mut warnings)?;
            index.add_content(&RepositoryFile {
                path: entry.path.clone(),
                name: entry.name.clone(),
                size: entry.size,
                content,
            });
            index.validate()?;
        }
        // Load only root configs and their declared local bases, through the same policy/revision checks.
        {
            let config_lookup: HashMap<_, _> = files.iter().map(|f| (f.path.as_str(), f)).collect();
            loop {
                let pending = index.pending_configs();
                if pending.is_empty() {
                    break;
                }
                for path in pending {
                    progress(Progress {
                        phase: "read",
                        completed: 0,
                        total: files.len(),
                    })?;
                    let content = if let Some(entry) = config_lookup.get(path.as_str()) {
                        scan_content(&root, entry, &mut warnings)?
                    } else {
                        None
                    };
                    index.load_config(&path, content.as_deref())?;
                }
            }
        }
        index.finish();
        index.validate()?;
        Arc::new(index)
    };
    let index_valid = warnings.is_empty();
    let lookup: std::collections::HashMap<_, _> =
        files.iter().map(|f| (f.path.as_str(), f)).collect();
    // Second pass loads/parses/drops one source file at a time.
    let mut changes = ChangeSummary {
        added: entries
            .keys()
            .filter(|path| previous.is_none_or(|old| !old.entries.contains_key(*path)))
            .count(),
        removed: previous.map_or(0, |old| {
            old.entries
                .keys()
                .filter(|path| !entries.contains_key(*path))
                .count()
        }),
        ..Default::default()
    };
    let mut relations = HashMap::new();
    let mut relation_count = 0usize;
    let mut relation_bytes = 0usize;
    let mut packages = crate::packages::Builder::new();
    for entry in files
        .iter()
        .filter(|f| crate::packages::is_manifest(&f.path))
        .chain(lock_files.iter())
    {
        progress(Progress {
            phase: "read",
            completed: 0,
            total: files.len(),
        })?;
        let content = read_bounded_text_at(&root, entry, true)?;
        if content.status == "changed" {
            return Err(format!(
                "Repository changed during analysis: {}",
                entry.path
            ));
        }
        packages.load(&entry.path, content.content.as_deref())?;
    }
    packages.build(|| {
        progress(Progress {
            phase: "read",
            completed: 0,
            total: files.len(),
        })
    })?;
    let mut graph = analyze_relations(
        &metadata,
        &mut packages,
        |f| {
            let cached = reusable
                .filter(|old| {
                    old.parser_version == crate::syntax::VERSION
                        && old.entries.get(&f.path) == entries.get(&f.path)
                })
                .and_then(|old| old.relations.get(&f.path));
            let (result, cacheable) = if let Some(cached) = cached {
                changes.reused += 1;
                (cached.clone(), true)
            } else {
                let before = warnings.len();
                let loaded = RepositoryFile {
                    path: f.path.clone(),
                    name: f.name.clone(),
                    size: f.size,
                    content: scan_content(&root, lookup[f.path.as_str()], &mut warnings)?,
                };
                changes.parsed += 1;
                (Arc::new(index.extract(&loaded)), warnings.len() == before)
            };
            relation_count += result.relations.len();
            relation_bytes += result.bytes();
            if relation_count > 500_000 || relation_bytes > 128 * 1024 * 1024 {
                return Err("Relation cache exceeds 500,000 entries or 128 MiB of strings".into());
            }
            if cacheable {
                relations.insert(f.path.clone(), result.clone());
            }
            Ok(result)
        },
        |completed, total| {
            progress(Progress {
                phase: "analyze",
                completed,
                total,
            })
        },
    )?;
    graph.packages = packages.finish()?;
    // A reconciliation pass catches changes after an unchanged file was reused.
    let verify = |entry: &FileEntry| {
        ensure_revision_at(&root, entry).map_err(|error| {
            format!(
                "Repository changed during analysis: {}: {error}",
                entry.path
            )
        })
    };
    let workers = std::thread::available_parallelism().map_or(1, |n| n.get().min(4));
    let entries_to_check: Vec<_> = files.iter().chain(&lock_files).collect();
    let chunk_size = if entries_to_check.len() < 4096 {
        1
    } else {
        64 * workers
    };
    for (i, batch) in entries_to_check.chunks(chunk_size).enumerate() {
        progress(Progress {
            phase: "reconcile",
            completed: i * chunk_size,
            total: entries_to_check.len(),
        })?;
        if batch.len() <= 64 {
            for entry in batch {
                verify(entry)?;
            }
        } else {
            std::thread::scope(|scope| {
                let handles: Vec<_> = batch
                    .chunks(64)
                    .map(|part| {
                        scope.spawn(move || part.iter().try_for_each(|entry| verify(entry)))
                    })
                    .collect();
                for handle in handles {
                    handle.join().map_err(|_| "Revision worker stopped")??;
                }
                Ok::<(), String>(())
            })?;
        }
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    Ok((
        RepositorySnapshot {
            schema_version: 2,
            snapshot_id: format!(
                "{stamp}-{}",
                SNAPSHOT_COUNTER.fetch_add(1, Ordering::Relaxed)
            ),
            repository_id: root.to_string_lossy().into_owned(),
            name: root
                .file_name()
                .unwrap_or(root.as_os_str())
                .to_string_lossy()
                .into_owned(),
            files,
            graph,
            warnings,
            changes,
        },
        ScanCache {
            entries,
            index_files,
            index,
            relations,
            index_valid,
            parser_version: crate::syntax::VERSION,
        },
    ))
}

fn scan_content(
    root: &Path,
    entry: &FileEntry,
    warnings: &mut Vec<String>,
) -> Result<Option<String>, String> {
    if entry.content_state != "text" {
        return Ok(None);
    }
    match read_bounded_text_at(root, entry, false) {
        Ok(result) if result.status == "changed" => Err(format!(
            "Repository changed during analysis: {}",
            entry.path
        )),
        Ok(result) => {
            if result.status != "ready" {
                warnings.push(format!("{}: {}", entry.path, result.status));
            }
            Ok(result.content)
        }
        Err(error) => {
            warnings.push(format!("{}: {error}", entry.path));
            Ok(None)
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub line: Option<usize>,
    pub snippet: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub hits: Vec<SearchHit>,
    pub next_cursor: Option<usize>,
    pub scanned: usize,
    pub total: usize,
    pub searched_text: usize,
    pub skipped_text: usize,
    pub changed: usize,
    pub unreadable: usize,
}

pub fn search(
    root: &Path,
    files: &[FileEntry],
    query: &str,
    cursor: usize,
    limit: usize,
    mut check: impl FnMut() -> Result<(), String>,
) -> Result<SearchPage, String> {
    if query.chars().count() < 2
        || query.len() > 512
        || limit == 0
        || limit > 200
        || cursor > files.len()
    {
        return Err("Invalid search request".into());
    }
    let query = query.to_lowercase();
    let mut page = SearchPage {
        hits: Vec::new(),
        next_cursor: None,
        scanned: cursor,
        total: files.len(),
        searched_text: 0,
        skipped_text: 0,
        changed: 0,
        unreadable: 0,
    };
    for entry in files.iter().skip(cursor).take(256) {
        check()?;
        let mut hit = if entry.path.to_lowercase().contains(&query) {
            Some(SearchHit {
                path: entry.path.clone(),
                line: None,
                snippet: String::new(),
            })
        } else {
            None
        };
        if entry.content_state == "text" {
            match read_text(root, entry) {
                Ok(result) if result.status == "ready" => {
                    page.searched_text += 1;
                    if let Some(text) = result.content {
                        for (line, value) in text.lines().enumerate() {
                            let lowered = value.to_lowercase();
                            if lowered.contains(&query) {
                                // Snippets are bounded and are plain text, never interpreted as HTML.
                                hit = Some(SearchHit {
                                    path: entry.path.clone(),
                                    line: Some(line + 1),
                                    snippet: value.chars().take(240).collect(),
                                });
                                break;
                            }
                        }
                    }
                }
                Ok(result) if result.status == "changed" => {
                    page.changed += 1;
                }
                Ok(_) => {
                    page.skipped_text += 1;
                }
                Err(_) => {
                    page.unreadable += 1;
                }
            }
        } else {
            page.skipped_text += 1;
        }
        page.scanned += 1;
        if let Some(hit) = hit {
            page.hits.push(hit);
        }
        if page.hits.len() == limit {
            break;
        }
    }
    check()?;
    if page.scanned < files.len() {
        page.next_cursor = Some(page.scanned);
    }
    Ok(page)
}

pub fn confined_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let root = canonical_root(root)?;
    confined_entry_at(&root, relative).map(|(path, _)| path)
}

fn confined_entry_at(root: &Path, relative: &str) -> Result<(PathBuf, fs::Metadata), String> {
    if relative.is_empty()
        || relative.contains('\\')
        || relative.contains(':')
        || relative
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == "..")
        || Path::new(relative)
            .components()
            .any(|p| !matches!(p, Component::Normal(_)))
    {
        return Err("Invalid repository path".into());
    }
    if policy::is_sensitive_path(relative) {
        return Err("File is excluded by the sensitive-file policy".into());
    }
    let path = root
        .join(relative)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.starts_with(root) {
        return Err("File is outside the selected repository".into());
    }
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("File is outside the selected repository".into());
    }
    let resolved = path.strip_prefix(root).map_err(|e| e.to_string())?;
    if policy::is_sensitive_path(&resolved.to_string_lossy()) {
        return Err("File is excluded by the sensitive-file policy".into());
    }
    Ok((path, meta))
}

pub fn ensure_revision(root: &Path, entry: &FileEntry) -> Result<(), String> {
    let root = canonical_root(root)?;
    ensure_revision_at(&root, entry)
}

fn ensure_revision_at(root: &Path, entry: &FileEntry) -> Result<(), String> {
    let (_, meta) = confined_entry_at(root, &entry.path)?;
    if revision(&meta) != entry.revision {
        return Err("File changed; reopen the repository".into());
    }
    Ok(())
}

pub fn read_asset(root: &Path, relative: &str) -> Result<Vec<u8>, String> {
    if policy::classify(relative) != Some(FileKind::Asset) {
        return Err("Unsupported asset type".into());
    }
    let path = confined_path(root, relative)?;
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.take(MAX_ASSET_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_ASSET_BYTES {
        return Err("Asset exceeds the 128 MiB preview limit".into());
    }
    Ok(bytes)
}
