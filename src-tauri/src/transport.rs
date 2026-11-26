use crate::{check_session, Backend, Session};
#[cfg(test)]
mod validation {
    use super::*;
    #[test]
    fn f1_transfer_rejects_stale_cursors_and_publishes_only_when_complete() {
        use std::sync::atomic::Ordering;
        let root = crate::validation_support::folder("transfer");
        for i in 0..300 {
            std::fs::write(root.join(format!("{i}.txt")), "text").unwrap();
        }
        std::fs::write(root.join("package.json"), r#"{"dependencies":{"dep":"1"}}"#).unwrap();
        std::fs::write(root.join("main.js"), "import 'dep';").unwrap();
        std::fs::write(root.join("package-lock.json"), r#"{"lockfileVersion":999}"#).unwrap();
        let old = Arc::new(crate::validation_support::session(&root));
        let current = Arc::new(crate::validation_support::session(&root));
        let state = Backend::default();
        *state.session.lock().unwrap() = Some(old.clone());
        *state.pending.lock().unwrap() = Some(Transfer::new(current.clone()));
        state.busy.store(true, Ordering::SeqCst);
        assert!(finish_snapshot_into(&state, &current.id, &current.analysis_id).is_err());
        assert!(snapshot_batch_from(&state, "foreign", &current.analysis_id, 0, 0).is_err());
        assert!(snapshot_batch_from(&state, &current.id, "foreign", 0, 0).is_err());
        assert!(snapshot_batch_from(&state, &current.id, &current.analysis_id, 1, 0).is_err());
        for section in 0..7 {
            let mut cursor = 0;
            loop {
                let page =
                    snapshot_batch_from(&state, &current.id, &current.analysis_id, section, cursor)
                        .unwrap();
                if section >= 4 && cursor == 0 {
                    assert!(!page["items"].as_array().unwrap().is_empty());
                }
                assert!(snapshot_batch_from(
                    &state,
                    &current.id,
                    &current.analysis_id,
                    section,
                    cursor
                )
                .is_err());
                assert!(crate::get_session(&state, &old.id).is_ok());
                cursor = page["nextCursor"].as_u64().unwrap() as usize;
                if page["done"] == true {
                    break;
                }
            }
        }
        state.cancelled.store(true, Ordering::SeqCst);
        assert!(finish_snapshot_into(&state, &current.id, &current.analysis_id).is_err());
        state.cancelled.store(false, Ordering::SeqCst);
        finish_snapshot_into(&state, &current.id, &current.analysis_id).unwrap();
        assert!(crate::get_session(&state, &current.id).is_ok());
        assert!(check_session(&old).is_err());
        assert!(!state.busy.load(Ordering::SeqCst));
        assert!(state.pending.lock().unwrap().is_none());
        assert!(finish_snapshot_into(&state, &current.id, &current.analysis_id).is_err());
    }
    #[test]
    fn f1_ipc_item_and_byte_limits() {
        let items = vec!["small"; 600];
        let (a, n) = page(&items, 0).unwrap();
        assert_eq!(a.len(), 256);
        assert_eq!(n, 256);
        let (b, n) = page(&items, 512).unwrap();
        assert_eq!(b.len(), 88);
        assert_eq!(n, 600);
        let items = vec!["x".repeat(80_000); 6];
        let (v, n) = page(&items, 0).unwrap();
        assert_eq!(n, 3);
        assert!(serde_json::to_vec(&v).unwrap().len() + 4096 < 256 * 1024);
        assert!(page(&["x".repeat(256 * 1024)], 0).is_err());
    }
}
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct Transfer {
    pub session: Arc<Session>,
    section: usize,
    cursor: usize,
}
impl Transfer {
    pub fn new(session: Arc<Session>) -> Self {
        Self {
            session,
            section: 0,
            cursor: 0,
        }
    }
}
pub type Pending = Mutex<Option<Transfer>>;
pub fn manifest(session: &Session) -> Value {
    let s = &session.snapshot;
    json!({"schemaVersion": s.schema_version, "snapshotId": s.snapshot_id,
        "analysisId": session.analysis_id, "repositoryId": session.repository_id,
        "worktreeId": session.worktree_id, "legacyKey": s.repository_id,
        "name": s.name, "changes": s.changes, "stats": s.graph.stats,
        "packageDiagnosticsOmitted": s.graph.packages.diagnostics_omitted,
        "counts": [s.files.len(), s.graph.nodes.len(), s.graph.edges.len(), s.warnings.len(), s.graph.packages.nodes.len(), s.graph.packages.edges.len(), s.graph.packages.diagnostics.len()]})
}

// Each response is at most 256 items / 256 KiB, including envelope headroom.
fn page<T: Serialize>(items: &[T], start: usize) -> Result<(Vec<Value>, usize), String> {
    let mut values = Vec::new();
    let mut bytes = 4096;
    for item in items.iter().skip(start).take(256) {
        let value = serde_json::to_value(item).map_err(|e| e.to_string())?;
        let len = serde_json::to_vec(&value).map_err(|e| e.to_string())?.len() + 1;
        if len + 4096 > 256 * 1024 {
            return Err("Snapshot item exceeds the IPC batch budget".into());
        }
        if bytes + len > 256 * 1024 {
            break;
        }
        bytes += len;
        values.push(value);
    }
    let next = start + values.len();
    Ok((values, next))
}

#[tauri::command]
pub fn snapshot_batch(
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    analysis_id: String,
    section: usize,
    cursor: usize,
) -> Result<Value, String> {
    snapshot_batch_from(&state, &snapshot_id, &analysis_id, section, cursor)
}
fn snapshot_batch_from(
    state: &Backend,
    snapshot_id: &str,
    analysis_id: &str,
    section: usize,
    cursor: usize,
) -> Result<Value, String> {
    let mut pending = state.pending.lock().map_err(|e| e.to_string())?;
    let transfer = pending.as_mut().ok_or("Snapshot transfer expired")?;
    let session = &transfer.session;
    check_session(session)?;
    if session.id != snapshot_id
        || session.analysis_id != analysis_id
        || transfer.section != section
        || transfer.cursor != cursor
    {
        return Err("Invalid snapshot transfer cursor".into());
    }
    let s = &session.snapshot;
    let (items, next, total) = match section {
        0 => {
            let (v, n) = page(&s.files, cursor)?;
            (v, n, s.files.len())
        }
        1 => {
            let (v, n) = page(&s.graph.nodes, cursor)?;
            (v, n, s.graph.nodes.len())
        }
        2 => {
            let (v, n) = page(&s.graph.edges, cursor)?;
            (v, n, s.graph.edges.len())
        }
        3 => {
            let (v, n) = page(&s.warnings, cursor)?;
            (v, n, s.warnings.len())
        }
        4 => {
            let (v, n) = page(&s.graph.packages.nodes, cursor)?;
            (v, n, s.graph.packages.nodes.len())
        }
        5 => {
            let (v, n) = page(&s.graph.packages.edges, cursor)?;
            (v, n, s.graph.packages.edges.len())
        }
        6 => {
            let (v, n) = page(&s.graph.packages.diagnostics, cursor)?;
            (v, n, s.graph.packages.diagnostics.len())
        }
        _ => return Err("Invalid snapshot section".into()),
    };
    if next == total {
        transfer.section += 1;
        transfer.cursor = 0;
    } else {
        transfer.cursor = next;
    }
    Ok(
        json!({"analysisId": analysis_id, "snapshotId": snapshot_id, "section": section,
        "cursor": cursor, "nextCursor": next, "done": next == total, "items": items}),
    )
}

#[tauri::command]
pub fn finish_snapshot(
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    analysis_id: String,
) -> Result<(), String> {
    finish_snapshot_into(&state, &snapshot_id, &analysis_id)
}
fn finish_snapshot_into(
    state: &Backend,
    snapshot_id: &str,
    analysis_id: &str,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let mut pending = state.pending.lock().map_err(|e| e.to_string())?;
    let transfer = pending.as_ref().ok_or("Snapshot transfer expired")?;
    if transfer.session.id != snapshot_id
        || transfer.session.analysis_id != analysis_id
        || transfer.section != 7
        || state.cancelled.load(Ordering::SeqCst)
    {
        return Err("Snapshot transfer incomplete or cancelled".into());
    }
    let mut active = state.session.lock().map_err(|e| e.to_string())?;
    if let Some(old) = active.replace(transfer.session.clone()) {
        old.active.store(false, Ordering::SeqCst);
    }
    if let Some(job) = state.search.lock().map_err(|e| e.to_string())?.take() {
        job.cancelled.store(true, Ordering::SeqCst);
    }
    pending.take();
    state.git.invalidate();
    state.structure.invalidate();
    state.busy.store(false, Ordering::SeqCst);
    Ok(())
}
