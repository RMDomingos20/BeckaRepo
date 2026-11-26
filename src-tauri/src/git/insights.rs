use super::*;
#[cfg(test)]
mod validation {
    use super::*;
    #[test]
    fn f3_real_cochange_authorship_and_mass_exclusion() {
        let root = super::super::validation::fixture();
        let session = crate::validation_support::session(&root);
        let cancelled = AtomicBool::new(false);
        let runner = Runner {
            executable: git_executable(&root).unwrap(),
            root: session.root.clone(),
            session: &session,
            cancelled: &cancelled,
            started: Instant::now(),
        };
        let (_, bytes) = runner
            .run(
                &[
                    "log",
                    "--numstat",
                    "-z",
                    "--format=%x1e%H%x00%ct%x00%aN%x00%aE%x00",
                    "--no-ext-diff",
                    "--no-textconv",
                ],
                MAX_OUTPUT,
            )
            .unwrap();
        let until = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 10;
        let report = aggregate(&bytes, "", 0, until, 100, 2, true, &runner).unwrap();
        assert_eq!(report.files.len(), 2);
        assert_eq!(report.pairs.len(), 1);
        assert_eq!(report.pairs[0].support, 2);
        assert_eq!(report.pairs[0].target_given_source, 1.0);
        assert_eq!(report.files[0].authors.len(), 1);
        let excluded = aggregate(&bytes, "", 0, until, 1, 1, true, &runner).unwrap();
        assert_eq!(excluded.mass_commits, 2);
        assert!(excluded.files.is_empty());
        assert!(allowed("src/bin/main.rs"));
        assert!(!allowed("bin/output.rs"));
        assert!(!allowed(".env"));
    }
}
use std::collections::{BTreeMap, BTreeSet};

const COMMITS: usize = 1000;
const FILES: usize = 20_000;
const PAIRS: usize = 200_000;

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileStats {
    #[serde(skip)]
    index: usize,
    path: String,
    frequency: usize,
    additions: u64,
    deletions: u64,
    churn: u64,
    last_change: u64,
    binary_commits: usize,
    renames: usize,
    authors: BTreeSet<String>,
    authors_omitted: usize,
    score: f64,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pair {
    source: String,
    target: String,
    support: usize,
    target_given_source: f64,
    source_given_target: f64,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Report {
    since: u64,
    until: u64,
    examined_commits: usize,
    included_commits: usize,
    mass_commits: usize,
    excluded_records: usize,
    truncated: bool,
    total_files: usize,
    total_pairs: usize,
    files: Vec<FileStats>,
    pairs: Vec<Pair>,
}
struct Change {
    path: String,
    additions: u64,
    deletions: u64,
    binary: bool,
    rename: bool,
}
struct Revision {
    time: u64,
    author: Option<String>,
    records: usize,
    files: Vec<Change>,
}

fn allowed(path: &str) -> bool {
    !path.is_empty()
        && !path.starts_with('/')
        && !path.contains('\\')
        && !path
            .split('/')
            .any(|part| part == ".." || part == "." || part.is_empty())
        && !policy::is_sensitive_path(path)
        && !path
            .rmatch_indices('/')
            .any(|(index, _)| policy::should_skip_directory_at(&path[..index]))
        && policy::classify(path).is_some()
}

fn aggregate(
    bytes: &[u8],
    prefix: &str,
    since: u64,
    until: u64,
    mass_limit: usize,
    min_support: usize,
    authors: bool,
    runner: &Runner<'_>,
) -> Result<Report, String> {
    let text = std::str::from_utf8(bytes).map_err(|_| "Non-UTF-8 Git history")?;
    let mut tokens = text.split('\0');
    let mut revisions: Vec<Revision> = Vec::new();
    let mut excluded = 0;
    while let Some(token) = tokens.next() {
        runner.check()?;
        let token = token.trim_start_matches('\n');
        if token.is_empty() {
            continue;
        }
        if let Some(id) = token.strip_prefix('\u{1e}') {
            if !hash(id) {
                return Err("Invalid Git commit header".into());
            }
            let time = tokens
                .next()
                .ok_or("Missing Git time")?
                .parse::<u64>()
                .map_err(|_| "Invalid Git time")?;
            let author = if authors {
                let name = tokens.next().ok_or("Missing Git author")?;
                let email = tokens.next().ok_or("Missing Git email")?;
                if name.len() + email.len() > 1024 {
                    return Err("Git author exceeds 1 KiB".into());
                }
                Some(format!("{name} <{email}>"))
            } else {
                None
            };
            revisions.push(Revision {
                time,
                author,
                records: 0,
                files: Vec::new(),
            });
            continue;
        }
        let revision = revisions.last_mut().ok_or("Git numstat without header")?;
        revision.records += 1;
        let mut fields = token.splitn(3, '\t');
        let a = fields.next().ok_or("Invalid numstat")?;
        let d = fields.next().ok_or("Invalid numstat")?;
        let mut path = fields.next().ok_or("Invalid numstat path")?;
        let old = if path.is_empty() {
            let old = tokens.next().ok_or("Missing rename source")?;
            path = tokens.next().ok_or("Missing rename target")?;
            Some(old)
        } else {
            None
        };
        if path.len() > 4096 || old.is_some_and(|p| p.len() > 4096) {
            return Err("Git path exceeds 4 KiB".into());
        }
        let local = if prefix.is_empty() {
            Some(path)
        } else {
            path.strip_prefix(prefix)
        };
        let Some(local) = local.filter(|p| allowed(p)) else {
            excluded += 1;
            continue;
        };
        if old.is_some_and(policy::is_sensitive_path) {
            excluded += 1;
            continue;
        }
        let binary = a == "-" && d == "-";
        let additions = if binary {
            0
        } else {
            a.parse().map_err(|_| "Invalid additions")?
        };
        let deletions = if binary {
            0
        } else {
            d.parse().map_err(|_| "Invalid deletions")?
        };
        // Count all records for mass-commit exclusion, but don't retain their paths after the threshold.
        if revision.records <= mass_limit {
            revision.files.push(Change {
                path: local.into(),
                additions,
                deletions,
                binary,
                rename: old.is_some(),
            });
        }
    }
    let truncated = revisions.len() > COMMITS;
    let examined = revisions.len().min(COMMITS);
    let mut files = BTreeMap::<String, FileStats>::new();
    let mut pairs = BTreeMap::<(usize, usize), usize>::new();
    let mut author_bytes = 0;
    let mut mass = 0;
    let mut included = 0;
    for revision in revisions.into_iter().take(COMMITS) {
        runner.check()?;
        if revision.time < since || revision.time > until {
            continue;
        }
        if revision.records > mass_limit {
            mass += 1;
            continue;
        }
        if revision.files.is_empty() {
            continue;
        }
        included += 1;
        let mut unique = BTreeSet::new();
        for change in revision.files {
            if !unique.insert(change.path.clone()) {
                return Err("Duplicate path in Git commit".into());
            }
            if files.len() >= FILES && !files.contains_key(&change.path) {
                return Err("History exceeds 20,000 paths; narrow the window".into());
            }
            let index = files.len();
            let item = files
                .entry(change.path.clone())
                .or_insert_with(|| FileStats {
                    path: change.path,
                    index,
                    ..Default::default()
                });
            item.frequency += 1;
            item.additions = item
                .additions
                .checked_add(change.additions)
                .ok_or("Churn overflow")?;
            item.deletions = item
                .deletions
                .checked_add(change.deletions)
                .ok_or("Churn overflow")?;
            item.churn = item
                .additions
                .checked_add(item.deletions)
                .ok_or("Churn overflow")?;
            item.last_change = item.last_change.max(revision.time);
            item.binary_commits += usize::from(change.binary);
            item.renames += usize::from(change.rename);
            if let Some(author) = &revision.author {
                if item.authors.len() < 16 || item.authors.contains(author) {
                    if item.authors.insert(author.clone()) {
                        author_bytes += author.len();
                        if author_bytes > 8 * 1024 * 1024 {
                            return Err("Authorship metadata exceeds 8 MiB; disable authorship or narrow the window".into());
                        }
                    }
                } else {
                    item.authors_omitted += 1;
                }
            }
        }
        let paths: Vec<_> = unique.into_iter().collect();
        for i in 0..paths.len() {
            for j in i + 1..paths.len() {
                let key = (files[&paths[i]].index, files[&paths[j]].index);
                if pairs.len() >= PAIRS && !pairs.contains_key(&key) {
                    return Err(
                        "Co-change exceeds 200,000 pairs; narrow the window or mass-commit limit"
                            .into(),
                    );
                }
                *pairs.entry(key).or_default() += 1;
            }
        }
    }
    let max_churn = files.values().map(|f| f.churn).max().unwrap_or(0) as f64;
    let max_frequency = files.values().map(|f| f.frequency).max().unwrap_or(0) as f64;
    for file in files.values_mut() {
        let churn = if max_churn > 0.0 {
            (file.churn as f64).ln_1p() / max_churn.ln_1p()
        } else {
            0.0
        };
        let frequency = if max_frequency > 0.0 {
            file.frequency as f64 / max_frequency
        } else {
            0.0
        };
        let age = until.saturating_sub(file.last_change) as f64 / 86400.0;
        file.score = 100.0 * (0.45 * churn + 0.35 * frequency + 0.20 * 2.0_f64.powf(-age / 30.0));
    }
    let mut names = vec![""; files.len()];
    for file in files.values() {
        names[file.index] = file.path.as_str();
    }
    let mut ranked_pairs: Vec<_> = pairs
        .into_iter()
        .filter(|(_, support)| *support >= min_support)
        .collect();
    ranked_pairs.sort_by(|((a, b), sa), ((c, d), sb)| {
        sb.cmp(sa)
            .then(names[*a].cmp(names[*c]))
            .then(names[*b].cmp(names[*d]))
    });
    let pair_bytes: usize = ranked_pairs
        .iter()
        .map(|((a, b), _)| names[*a].len() + names[*b].len() + 128)
        .sum();
    if pair_bytes > 32 * 1024 * 1024 {
        return Err(
            "Cochange metadata exceeds 32 MiB; narrow the window or increase support".into(),
        );
    }
    let total_pairs = ranked_pairs.len();
    let pairs = ranked_pairs
        .into_iter()
        .map(|((a, b), support)| Pair {
            source: names[a].into(),
            target: names[b].into(),
            support,
            target_given_source: support as f64 / files[names[a]].frequency as f64,
            source_given_target: support as f64 / files[names[b]].frequency as f64,
        })
        .collect();
    let mut files: Vec<_> = files.into_values().collect();
    files.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.path.cmp(&b.path)));
    let total_files = files.len();
    Ok(Report {
        since,
        until,
        examined_commits: examined,
        included_commits: included,
        mass_commits: mass,
        excluded_records: excluded,
        truncated,
        total_files,
        total_pairs,
        files,
        pairs,
    })
}

fn query_repository(
    app: &tauri::AppHandle,
    session: &Session,
    query_id: &str,
    days: u64,
    mass_limit: usize,
    min_support: usize,
    authors: bool,
    force: bool,
    cancelled: &AtomicBool,
    file_page: usize,
    pair_page: usize,
) -> Result<serde_json::Value, String> {
    let empty =
        |status| serde_json::json!({"snapshotId":session.id,"queryId":query_id,"status":status});
    let Some(root) = candidate_root(&session.root) else {
        return Ok(empty("not-repository"));
    };
    let Some(executable) = git_executable(&root) else {
        return Ok(empty("missing-git"));
    };
    let runner = Runner {
        root,
        executable,
        session,
        cancelled,
        started: Instant::now(),
    };
    let root = PathBuf::from(runner.text(&["rev-parse", "--show-toplevel"])?)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if root != runner.root || !session.root.starts_with(&root) {
        return Err("Invalid Git scope".into());
    }
    let git_dir = runner.text(&["rev-parse", "--absolute-git-dir"])?;
    let common = runner.text(&["rev-parse", "--path-format=absolute", "--git-common-dir"])?;
    let mut warnings = Vec::new();
    let identity = match crate::storage::associate_git(
        app,
        session,
        &root,
        Path::new(&git_dir),
        Path::new(&common),
    ) {
        Ok(identity) => Some(identity),
        Err(error) => {
            warnings.push(error);
            None
        }
    };
    let (has_head, bytes) =
        runner.run(&["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], 256)?;
    if !has_head {
        return Ok(empty("unborn"));
    }
    let head = String::from_utf8(bytes)
        .map_err(|_| "Invalid HEAD")?
        .trim()
        .to_string();
    if !hash(&head) {
        return Err("Invalid HEAD".into());
    }
    let boundary = shallow_signature(&common)?;
    let shallow = runner.text(&["rev-parse", "--is-shallow-repository"])? == "true";
    let scope = session
        .root
        .strip_prefix(&root)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let prefix = if scope.is_empty() {
        String::new()
    } else {
        format!("{scope}/")
    };
    let until = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs()
        / 300
        * 300;
    let since = until.saturating_sub(days * 86400);
    let key = serde_json::to_string(&(
        "repository-history-v2",
        &git_dir,
        &scope,
        &head,
        &boundary,
        since,
        until,
        mass_limit,
        min_support,
    ))
    .map_err(|e| e.to_string())?;
    let cached = if force || authors {
        None
    } else {
        match crate::storage::read_git_cache(app, &key) {
            Ok(Some(payload)) => match serde_json::from_str::<Report>(&payload) {
                Ok(report) if report.since == since && report.until == until => Some(report),
                _ => {
                    warnings.push("Invalid Git cache ignored".into());
                    None
                }
            },
            Ok(None) => None,
            Err(error) => {
                warnings.push(error);
                None
            }
        }
    };
    let was_cached = cached.is_some();
    let mut report = if let Some(report) = cached {
        report
    } else {
        let format = if authors {
            "--format=%x1e%H%x00%ct%x00%aN%x00%aE%x00"
        } else {
            "--format=%x1e%H%x00%ct%x00"
        };
        let mut args = vec![
            "-c".to_string(),
            "mailmap.file=".into(),
            "-c".into(),
            "mailmap.blob=".into(),
            "log".into(),
            "--root".into(),
            "--no-decorate".into(),
            format.into(),
            "--numstat".into(),
            "-z".into(),
            "--no-merges".into(),
            "--find-renames=50%".into(),
            "--no-ext-diff".into(),
            "--no-textconv".into(),
            "--no-color".into(),
            "--no-notes".into(),
            "--no-show-signature".into(),
            "--diff-algorithm=myers".into(),
            format!("--since-as-filter=@{since}"),
            format!("--until=@{until}"),
            format!("--max-count={}", COMMITS + 1),
            head.clone(),
            "--".into(),
        ];
        if !scope.is_empty() {
            args.push(format!(":(top,literal){scope}"));
        }
        let (_, bytes) = runner.run(
            &args.iter().map(String::as_str).collect::<Vec<_>>(),
            16 * 1024 * 1024,
        )?;
        aggregate(
            &bytes,
            &prefix,
            since,
            until,
            mass_limit,
            min_support,
            authors,
            &runner,
        )?
    };
    runner.check()?;
    if runner.text(&["rev-parse", "--verify", "HEAD^{commit}"])? != head
        || shallow_signature(&common)? != boundary
    {
        return Err("Git history changed during analysis; refresh".into());
    }
    if !was_cached && !authors {
        let payload = serde_json::to_string(&report).map_err(|e| e.to_string())?;
        if let Err(error) = crate::storage::write_git_cache(app, &key, &payload) {
            warnings.push(error);
        }
    }
    report.files = report
        .files
        .into_iter()
        .skip(file_page * 100)
        .take(100)
        .collect();
    report.pairs = report
        .pairs
        .into_iter()
        .skip(pair_page * 100)
        .take(100)
        .collect();
    let mut result = serde_json::json!({"snapshotId":session.id,"queryId":query_id,"status":"ready",
        "head":head,"root":root,"scope":scope,"identity":identity,"shallow":shallow,"cached":was_cached,
        "filePage":file_page,"pairPage":pair_page,"pageSize":100,"massLimit":mass_limit,"minSupport":min_support,"authorsEnabled":authors,"warnings":warnings,"report":report});
    if let Some(files) = result["report"]["files"].as_array_mut() {
        for file in files {
            file["inSnapshot"] = serde_json::json!(session
                .lookup
                .contains_key(file["path"].as_str().unwrap_or("")));
        }
    }
    if serde_json::to_vec(&result)
        .map_err(|e| e.to_string())?
        .len()
        > 4 * 1024 * 1024
    {
        return Err("Git summary exceeds 4 MiB; narrow the window".into());
    }
    Ok(result)
}

#[tauri::command]
pub async fn git_repository_insights(
    app: tauri::AppHandle,
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    query_id: String,
    days: u64,
    mass_limit: usize,
    min_support: usize,
    authors: bool,
    force: bool,
    file_page: usize,
    pair_page: usize,
) -> Result<serde_json::Value, String> {
    if ![7, 30, 90, 365].contains(&days)
        || !(10..=100).contains(&mass_limit)
        || !(2..=10).contains(&min_support)
        || file_page > 200
        || pair_page > 2000
        || query_id.is_empty()
        || query_id.len() > 128
    {
        return Err("Invalid repository Git query".into());
    }
    let session = get_session(&state, &snapshot_id)?;
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = state.git.active.lock().map_err(|e| e.to_string())?;
        if let Some(old) = active.replace(Job {
            id: query_id.clone(),
            cancelled: cancelled.clone(),
        }) {
            old.cancelled.store(true, Ordering::SeqCst);
        }
    }
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = state.git.gate.lock().map_err(|e| e.to_string())?;
        if cancelled.load(Ordering::SeqCst) {
            return Err("Git query cancelled".into());
        }
        check_session(&session)?;
        let result = query_repository(
            &app,
            &session,
            &query_id,
            days,
            mass_limit,
            min_support,
            authors,
            force,
            &cancelled,
            file_page,
            pair_page,
        )?;
        check_session(&session)?;
        if cancelled.load(Ordering::SeqCst) {
            return Err("Git query cancelled".into());
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
