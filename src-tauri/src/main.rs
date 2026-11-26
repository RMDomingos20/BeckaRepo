#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod git;
mod storage;
mod structure;
mod transport;
#[cfg(test)]
mod validation_support;
use beckarepo_core::repository::{self, FileEntry, RepositorySnapshot, SearchPage, TextContent};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, Manager, State};

struct Session {
    id: String,
    root: PathBuf,
    snapshot: RepositorySnapshot,
    cache: repository::ScanCache,
    analysis_id: String,
    repository_id: String,
    worktree_id: String,
    lookup: HashMap<String, usize>,
    active: AtomicBool,
}
struct SearchJob {
    id: String,
    snapshot_id: String,
    query: String,
    cursor: usize,
    cancelled: Arc<AtomicBool>,
}
#[derive(Default)]
struct Backend {
    session: Mutex<Option<Arc<Session>>>,
    dropped: Mutex<HashSet<PathBuf>>,
    busy: AtomicBool,
    cancelled: AtomicBool,
    search: Mutex<Option<SearchJob>>,
    search_gate: Mutex<()>,
    read_gate: Mutex<()>,
    pending: transport::Pending,
    analysis_id: Mutex<Option<String>>,
    unsaved: AtomicBool,
    git: git::GitState,
    structure: structure::StructureState,
}
struct BusyGuard(Arc<Backend>, bool);
impl Drop for BusyGuard {
    fn drop(&mut self) {
        if !self.1 {
            self.0.busy.store(false, Ordering::SeqCst);
        }
    }
}

fn check_session(session: &Session) -> Result<(), String> {
    if !session.active.load(Ordering::SeqCst) {
        return Err("Repository session expired".into());
    }
    Ok(())
}
fn get_session(state: &Backend, id: &str) -> Result<Arc<Session>, String> {
    let lock = state.session.lock().map_err(|e| e.to_string())?;
    let session = lock.as_ref().ok_or("No repository is open")?;
    if session.id != id {
        return Err("Repository session expired".into());
    }
    check_session(session)?;
    Ok(session.clone())
}
fn get_entry<'a>(session: &'a Session, path: &str) -> Result<&'a FileEntry, String> {
    let index = session
        .lookup
        .get(path)
        .ok_or("File does not belong to the open repository")?;
    Ok(&session.snapshot.files[*index])
}
fn invalidate(state: &Backend) -> Result<(), String> {
    state.git.invalidate();
    state.structure.invalidate();
    if let Some(session) = state.session.lock().map_err(|e| e.to_string())?.take() {
        session.active.store(false, Ordering::SeqCst);
    }
    if let Some(job) = state.search.lock().map_err(|e| e.to_string())?.take() {
        job.cancelled.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
async fn open_repository(
    app: tauri::AppHandle,
    state: State<'_, Arc<Backend>>,
    dropped_path: Option<String>,
    analysis_id: String,
    refresh_snapshot_id: Option<String>,
) -> Result<Option<serde_json::Value>, String> {
    if state.unsaved.load(Ordering::SeqCst) {
        return Err("Save or discard drafts before opening a repository".into());
    }
    if analysis_id.is_empty() || analysis_id.len() > 128 {
        return Err("Invalid analysis id".into());
    }
    let previous = refresh_snapshot_id
        .as_deref()
        .map(|id| get_session(&state, id))
        .transpose()?;
    let state = Arc::clone(state.inner());
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err("An analysis is already running".into());
    }
    let guard = BusyGuard(state.clone(), false);
    *state.analysis_id.lock().map_err(|e| e.to_string())? = Some(analysis_id.clone());
    state.cancelled.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = guard;
        let chosen = if let Some(old) = &previous { Some(old.root.clone()) } else if let Some(path) = dropped_path {
            let root = repository::canonical_root(&PathBuf::from(path))?;
            if !state
                .dropped
                .lock()
                .map_err(|e| e.to_string())?
                .remove(&root)
            {
                return Err("Choose a folder using the dialog or drop it into the window".into());
            }
            Some(root)
        } else {
            rfd::FileDialog::new()
                .set_title("BeckaRepo — Select repository")
                .pick_folder()
        };
        let Some(chosen) = chosen else {
            return Ok(None);
        };
        let root = repository::canonical_root(&chosen)?;
        let mut last_phase = "";
        let mut last_update = std::time::Instant::now();
        let (snapshot, cache) = repository::scan_incremental(&root, previous.as_ref().map(|s| &s.cache), |progress| {
            if state.cancelled.load(Ordering::SeqCst) {
                return Err("Analysis cancelled".into());
            }
            if progress.phase != last_phase || last_update.elapsed().as_millis() >= 100 {
                last_phase = progress.phase;
                last_update = std::time::Instant::now();
                let _ = app.emit("analysis-progress", serde_json::json!({"analysisId": analysis_id, "phase": progress.phase, "completed": progress.completed, "total": progress.total}));
            }
            Ok(())
        })?;
        if state.cancelled.load(Ordering::SeqCst) {
            return Err("Analysis cancelled".into());
        }
        let mut snapshot = snapshot;
        let identity = storage::identify(&app, &root).unwrap_or_else(|error| {
            snapshot.warnings.push(format!("Annotations unavailable: {error}"));
            let fallback = format!("unavailable:{}", root.display());
            (fallback.clone(), fallback)
        });
        let session = Arc::new(Session {
            id: snapshot.snapshot_id.clone(),
            root,
            lookup: snapshot
                .files
                .iter()
                .enumerate()
                .map(|(i, f)| (f.path.clone(), i))
                .collect(),
            snapshot, cache, analysis_id,
            repository_id: identity.0, worktree_id: identity.1,
            active: AtomicBool::new(true),
        });
        let mut pending = state.pending.lock().map_err(|e| e.to_string())?;
        if state.cancelled.load(Ordering::SeqCst) {
            return Err("Analysis cancelled".into());
        }
        let manifest = transport::manifest(&session);
        *pending = Some(transport::Transfer::new(session));
        guard.1 = true;
        Ok(Some(manifest))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn set_unsaved_changes(state: State<'_, Arc<Backend>>, unsaved: bool) {
    state.unsaved.store(unsaved, Ordering::SeqCst);
}
#[tauri::command]
fn cancel_analysis(state: State<'_, Arc<Backend>>, analysis_id: Option<String>) {
    let Ok(current) = state.analysis_id.lock() else {
        return;
    };
    if analysis_id.is_some() && *current != analysis_id {
        return;
    }
    state.cancelled.store(true, Ordering::SeqCst);
    if let Ok(mut pending) = state.pending.lock() {
        if let Some(transfer) = pending.take() {
            transfer.session.active.store(false, Ordering::SeqCst);
            state.busy.store(false, Ordering::SeqCst);
        }
    }
}
#[tauri::command]
fn close_repository(state: State<'_, Arc<Backend>>) -> Result<(), String> {
    if state.unsaved.load(Ordering::SeqCst) {
        return Err("Save or discard drafts before closing the repository".into());
    }
    cancel_analysis(state.clone(), None);
    invalidate(&state)
}
#[tauri::command]
async fn read_file_content(
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    path: String,
) -> Result<TextContent, String> {
    let session = get_session(&state, &snapshot_id)?;
    get_entry(&session, &path)?;
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = state.read_gate.lock().map_err(|e| e.to_string())?;
        check_session(&session)?;
        let result = repository::read_text(&session.root, get_entry(&session, &path)?)?;
        check_session(&session)?;
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn read_asset(
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    let session = get_session(&state, &snapshot_id)?;
    get_entry(&session, &path)?;
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = state.read_gate.lock().map_err(|e| e.to_string())?;
        check_session(&session)?;
        let entry = get_entry(&session, &path)?;
        repository::ensure_revision(&session.root, entry)?;
        let bytes = repository::read_asset(&session.root, &path)?;
        repository::ensure_revision(&session.root, entry)?;
        check_session(&session)?;
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn file_symbols(
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    path: String,
) -> Result<beckarepo_core::symbols::Report, String> {
    let session = get_session(&state, &snapshot_id)?;
    get_entry(&session, &path)?;
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = state.read_gate.lock().map_err(|e| e.to_string())?;
        symbols_from_session(&session, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}
fn symbols_from_session(
    session: &Session,
    path: &str,
) -> Result<beckarepo_core::symbols::Report, String> {
    check_session(session)?;
    let entry = get_entry(session, path)?;
    let loaded = repository::read_text(&session.root, entry)?;
    if loaded.status != "ready" {
        return Err(format!(
            "Symbols unavailable: {}. Refresh the repository if the file changed.",
            loaded.status
        ));
    }
    let report = beckarepo_core::symbols::analyze(
        path,
        &entry.revision,
        loaded.content.as_deref().unwrap_or(""),
        || check_session(session),
    )?;
    repository::ensure_revision(&session.root, entry)?;
    check_session(session)?;
    Ok(report)
}
#[tauri::command]
async fn search_repository(
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    query_id: String,
    query: String,
    cursor: usize,
    limit: usize,
) -> Result<SearchPage, String> {
    if query_id.is_empty()
        || query_id.len() > 128
        || query.chars().count() < 2
        || query.len() > 512
        || limit == 0
        || limit > 200
    {
        return Err("Invalid search id".into());
    }
    let session = get_session(&state, &snapshot_id)?;
    let cancelled = {
        let mut search = state.search.lock().map_err(|e| e.to_string())?;
        check_session(&session)?;
        if cursor > session.snapshot.files.len() {
            return Err("Invalid search cursor".into());
        }
        if cursor == 0 {
            if let Some(old) = search.take() {
                old.cancelled.store(true, Ordering::SeqCst);
            }
            *search = Some(SearchJob {
                id: query_id.clone(),
                snapshot_id: snapshot_id.clone(),
                query: query.clone(),
                cursor: 0,
                cancelled: Arc::new(AtomicBool::new(false)),
            });
        }
        let job = search
            .as_ref()
            .filter(|j| {
                j.id == query_id
                    && j.snapshot_id == snapshot_id
                    && j.query == query
                    && j.cursor == cursor
            })
            .ok_or("Search cancelled")?;
        job.cancelled.clone()
    };
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = state.search_gate.lock().map_err(|e| e.to_string())?;
        let page = repository::search(
            &session.root,
            &session.snapshot.files,
            &query,
            cursor,
            limit,
            || {
                check_session(&session)?;
                if cancelled.load(Ordering::SeqCst) {
                    return Err("Search cancelled".into());
                }
                Ok(())
            },
        )?;
        let mut job = state.search.lock().map_err(|e| e.to_string())?;
        let job = job
            .as_mut()
            .filter(|j| j.id == query_id && !j.cancelled.load(Ordering::SeqCst))
            .ok_or("Search cancelled")?;
        job.cursor = page.next_cursor.unwrap_or(session.snapshot.files.len());
        Ok(page)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn cancel_search(state: State<'_, Arc<Backend>>, query_id: String) -> Result<(), String> {
    let search = state.search.lock().map_err(|e| e.to_string())?;
    if let Some(job) = search.as_ref().filter(|j| j.id == query_id) {
        job.cancelled.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
async fn export_markdown(name: String, content: String) -> Result<bool, String> {
    if content.len() > 16 * 1024 * 1024 {
        return Err("Export exceeds 16 MiB".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let safe: String = name
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .take(80)
            .collect();
        let Some(path) = rfd::FileDialog::new()
            .add_filter("Markdown", &["md"])
            .set_file_name(format!("{safe}_mapa.md"))
            .save_file()
        else {
            return Ok(false);
        };
        std::fs::write(path, content).map_err(|e| e.to_string())?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .manage(Arc::new(Backend::default()))
        .setup(|app| {
            app.manage(storage::Store::open(app.handle()));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window
                    .state::<Arc<Backend>>()
                    .unsaved
                    .load(Ordering::SeqCst)
                {
                    api.prevent_close();
                    let _ = window.emit("unsaved-changes", ());
                }
            }
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                let state = window.state::<Arc<Backend>>();
                let mut accepted = Vec::new();
                if let Ok(mut dropped) = state.dropped.lock() {
                    dropped.clear();
                    for path in paths {
                        if let Ok(root) = repository::canonical_root(path) {
                            accepted.push(root.to_string_lossy().into_owned());
                            dropped.insert(root);
                        }
                    }
                };
                if !accepted.is_empty() {
                    let _ = window.emit("repository-dropped", accepted);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_repository,
            git::git_file_history,
            git::insights::git_repository_insights,
            git::cancel_git,
            structure::structural_metrics,
            structure::cancel_structure,
            set_unsaved_changes,
            transport::snapshot_batch,
            transport::finish_snapshot,
            storage::load_annotations,
            storage::save_annotation,
            storage::import_annotations,
            storage::import_legacy_file,
            storage::get_preferences,
            storage::set_preference,
            storage::backup_database,
            storage::restore_database,
            storage::database_status,
            storage::saved_locations,
            storage::reassociate_location,
            cancel_analysis,
            close_repository,
            read_asset,
            read_file_content,
            file_symbols,
            search_repository,
            cancel_search,
            export_markdown
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start BeckaRepo");
}
