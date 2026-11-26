use super::*;
pub fn folder(label: &str) -> PathBuf {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "beckarepo-validation-{label}-{}-{stamp}",
        std::process::id()
    ));
    std::fs::create_dir_all(&path).unwrap();
    path
}
pub fn session(root: &std::path::Path) -> Session {
    let (snapshot, cache) = repository::scan_incremental(root, None, |_| Ok(())).unwrap();
    Session {
        id: snapshot.snapshot_id.clone(),
        root: repository::canonical_root(root).unwrap(),
        lookup: snapshot
            .files
            .iter()
            .enumerate()
            .map(|(i, f)| (f.path.clone(), i))
            .collect(),
        snapshot,
        cache,
        analysis_id: "validation".into(),
        repository_id: "repo".into(),
        worktree_id: "worktree".into(),
        active: AtomicBool::new(true),
    }
}
#[test]
fn f7_symbols_require_current_authorized_file_and_session() {
    let root = folder("symbols");
    std::fs::write(root.join("main.rs"), "fn f(){if true{}} fn main(){f();}").unwrap();
    let session = session(&root);
    let report = super::symbols_from_session(&session, "main.rs").unwrap();
    assert_eq!(report.symbols.len(), 2);
    assert!(super::symbols_from_session(&session, "../main.rs").is_err());
    assert!(super::symbols_from_session(&session, "absent.rs").is_err());
    std::fs::write(
        root.join("main.rs"),
        "fn changed() {} // changed revision and length",
    )
    .unwrap();
    assert!(super::symbols_from_session(&session, "main.rs").is_err());
    session.active.store(false, Ordering::SeqCst);
    assert!(super::symbols_from_session(&session, "main.rs").is_err());
}
#[test]
fn f1_expired_and_foreign_sessions_are_rejected() {
    let root = folder("session");
    std::fs::write(root.join("a.txt"), "ok").unwrap();
    let session = Arc::new(session(&root));
    let backend = Backend::default();
    *backend.session.lock().unwrap() = Some(session.clone());
    assert!(get_session(&backend, "foreign").is_err());
    assert!(get_entry(&session, "../a.txt").is_err());
    invalidate(&backend).unwrap();
    assert!(check_session(&session).is_err());
    assert!(get_session(&backend, &session.id).is_err());
}
