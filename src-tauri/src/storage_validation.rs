use super::*;
fn database(label: &str) -> Database {
    Database::open(crate::validation_support::folder(label)).unwrap()
}
fn seed(db: &Database) {
    db.connection.execute_batch("INSERT INTO repositories(id) VALUES('r'); INSERT INTO worktrees(id,repository_id) VALUES('w','r'),('other','r');").unwrap();
}
#[test]
fn f2_schema_migrations_and_restart_persistence() {
    let db = database("database");
    seed(&db);
    let dir = db.directory.clone();
    let a = Annotation {
        note: "nota de validação".into(),
        tags: vec!["review".into()],
        revision: 1,
    };
    write_annotation(&db.connection, "w", "src/a.rs", &a).unwrap();
    db.connection
        .execute(
            "INSERT INTO preferences(key,value) VALUES('language','\"en\"')",
            [],
        )
        .unwrap();
    drop(db);
    let db = Database::open(dir).unwrap();
    validate_database(&db.connection).unwrap();
    assert_eq!(
        db.connection
            .pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        2
    );
    let restored = read_annotation(&db.connection, "w", "src/a.rs").unwrap();
    assert_eq!(restored.note, a.note);
    assert_eq!(restored.tags, a.tags);
    assert_eq!(restored.revision, 1);
    assert_eq!(
        read_annotation(&db.connection, "other", "src/a.rs")
            .unwrap()
            .revision,
        0
    );
    assert_eq!(
        db.connection
            .query_row::<String, _, _>(
                "SELECT value FROM preferences WHERE key='language'",
                [],
                |r| r.get(0)
            )
            .unwrap(),
        "\"en\""
    );
}

#[test]
fn f2_populated_v1_database_migrates_without_losing_notes() {
    let db = database("migration-source");
    // Initial backup is made before migrating a newly created schema 1 to schema 2.
    let backup = std::fs::read_dir(db.directory.join("backups"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let dir = crate::validation_support::folder("migration-v1");
    let path = dir.join("beckarepo.sqlite");
    std::fs::copy(backup, &path).unwrap();
    let connection = Connection::open(&path).unwrap();
    assert_eq!(
        connection
            .pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        1
    );
    connection.execute_batch("INSERT INTO repositories(id) VALUES('r'); INSERT INTO worktrees(id,repository_id) VALUES('w','r');").unwrap();
    write_annotation(
        &connection,
        "w",
        "old.rs",
        &Annotation {
            note: "pre-migration".into(),
            revision: 7,
            ..Default::default()
        },
    )
    .unwrap();
    drop(connection);
    let migrated = Database::open(dir).unwrap();
    assert_eq!(
        migrated
            .connection
            .pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        2
    );
    let saved = read_annotation(&migrated.connection, "w", "old.rs").unwrap();
    assert_eq!(saved.note, "pre-migration");
    assert_eq!(saved.revision, 7);
    validate_database(&migrated.connection).unwrap();
}
#[test]
fn f2_backup_restore_retention_and_integrity() {
    let mut db = database("backup");
    seed(&db);
    write_annotation(
        &db.connection,
        "w",
        "a.rs",
        &Annotation {
            note: "original".into(),
            revision: 1,
            ..Default::default()
        },
    )
    .unwrap();
    let backup = db.backup(None).unwrap();
    for _ in 0..7 {
        db.backup(Some(&backup)).unwrap();
    }
    assert!(backup.exists());
    assert!(
        std::fs::read_dir(db.directory.join("backups"))
            .unwrap()
            .count()
            <= 5
    );
    write_annotation(
        &db.connection,
        "w",
        "a.rs",
        &Annotation {
            note: "changed".into(),
            revision: 2,
            ..Default::default()
        },
    )
    .unwrap();
    let source = Connection::open_with_flags(backup, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    validate_database(&source).unwrap();
    copy_database(&source, &mut db.connection).unwrap();
    assert_eq!(
        read_annotation(&db.connection, "w", "a.rs").unwrap().note,
        "original"
    );
}
#[test]
fn f2_invalid_corrupt_newer_and_executable_schema_rejected() {
    let db = database("invaliddb");
    db.connection
        .execute_batch("CREATE VIEW unexpected AS SELECT 1;")
        .unwrap();
    assert!(validate_database(&db.connection).is_err());
    let dir = crate::validation_support::folder("corrupt");
    std::fs::write(dir.join("beckarepo.sqlite"), "not sqlite").unwrap();
    assert!(Database::open(dir.clone()).is_err());
    assert_eq!(
        std::fs::read(dir.join("beckarepo.sqlite")).unwrap(),
        b"not sqlite"
    );
    let dir = crate::validation_support::folder("future");
    let con = Connection::open(dir.join("beckarepo.sqlite")).unwrap();
    con.pragma_update(None, "user_version", 999).unwrap();
    drop(con);
    assert!(Database::open(dir).is_err());
}
#[test]
fn f2_transaction_rollback_busy_and_validation() {
    let mut db = database("rollback");
    seed(&db);
    {
        let tx = db.connection.transaction().unwrap();
        write_annotation(
            &tx,
            "w",
            "a.rs",
            &Annotation {
                note: "uncommitted".into(),
                revision: 1,
                ..Default::default()
            },
        )
        .unwrap();
    }
    assert_eq!(
        read_annotation(&db.connection, "w", "a.rs")
            .unwrap()
            .revision,
        0
    );
    let lock = Connection::open(db.directory.join("beckarepo.sqlite")).unwrap();
    lock.execute_batch("BEGIN IMMEDIATE").unwrap();
    db.connection
        .busy_timeout(Duration::from_millis(30))
        .unwrap();
    assert!(write_annotation(&db.connection, "w", "a.rs", &Annotation::default()).is_err());
    lock.execute_batch("ROLLBACK").unwrap();
    for path in ["../a.rs", ".env", "C:/a.rs"] {
        assert!(validate_annotation(path, &Annotation::default()).is_err());
    }
    assert!(validate_annotation(
        "a.rs",
        &Annotation {
            tags: vec!["dup".into(), "dup".into()],
            ..Default::default()
        }
    )
    .is_err());
}

#[test]
fn f2_conflicts_idempotent_import_and_sqlite_quota() {
    let mut db = database("conflicts");
    seed(&db);
    let root = crate::validation_support::folder("annotation-session");
    let mut session = crate::validation_support::session(&root);
    session.worktree_id = "w".into();
    let saved = save_into(
        &mut db,
        &session,
        "a.rs",
        Annotation {
            note: "first".into(),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(saved.revision, 1);
    let stale = save_into(
        &mut db,
        &session,
        "a.rs",
        Annotation {
            note: "stale".into(),
            ..Default::default()
        },
    );
    assert!(stale.err().unwrap().contains("changed elsewhere"));
    let data = r#"{"a.rs":{"note":"legacy"},"b.rs":{"note":"imported","tags":["review"]}}"#;
    assert_eq!(import_into(&mut db, &session, "legacy", data).unwrap(), 1);
    assert_eq!(import_into(&mut db, &session, "legacy", data).unwrap(), 0);
    assert_eq!(
        read_annotation(&db.connection, "w", "a.rs").unwrap().note,
        "first"
    );
    assert_eq!(
        read_annotation(&db.connection, "w", "b.rs").unwrap().note,
        "imported"
    );
    assert!(import_into(
        &mut db,
        &session,
        "invalid",
        r#"{"c.rs":{"note":"valid"},"../bad":{"note":"invalid"}}"#
    )
    .is_err());
    assert_eq!(
        read_annotation(&db.connection, "w", "c.rs")
            .unwrap()
            .revision,
        0
    );
    // Simulate SQLite capacity exhaustion without filling the user's disk.
    let pages: i64 = db
        .connection
        .pragma_query_value(None, "page_count", |r| r.get(0))
        .unwrap();
    db.connection
        .pragma_update(None, "max_page_count", pages)
        .unwrap();
    let result = save_into(
        &mut db,
        &session,
        "a.rs",
        Annotation {
            note: "x".repeat(32_000),
            revision: 1,
            ..Default::default()
        },
    );
    assert!(result.is_err());
    assert_eq!(
        read_annotation(&db.connection, "w", "a.rs").unwrap().note,
        "first"
    );
    validate_database(&db.connection).unwrap();
}

#[test]
fn f3_persistent_cache_restart_expiry_and_retention() {
    let mut db = database("git-cache");
    let directory = db.directory.clone();
    write_git_cache_into(&mut db, "head-a", "{\"commits\":[]}").unwrap();
    drop(db);
    let mut db = Database::open(directory).unwrap();
    assert_eq!(
        read_git_cache_from(&db, "head-a").unwrap().as_deref(),
        Some("{\"commits\":[]}")
    );
    assert!(read_git_cache_from(&db, "head-b").unwrap().is_none());
    db.connection
        .execute("UPDATE git_cache SET created=unixepoch()-604801", [])
        .unwrap();
    assert!(read_git_cache_from(&db, "head-a").unwrap().is_none());
    for i in 0..70 {
        write_git_cache_into(&mut db, &format!("head-{i}"), "{}").unwrap();
    }
    assert_eq!(
        db.connection
            .query_row::<i64, _, _>("SELECT count(*) FROM git_cache", [], |r| r.get(0))
            .unwrap(),
        64
    );
    assert!(write_git_cache_into(&mut db, "oversized", &"x".repeat(8 * 1024 * 1024 + 1)).is_err());
    assert!(read_git_cache_from(&db, "oversized").unwrap().is_none());
}

fn store(db: Database) -> Store {
    Store {
        path: db.directory.join("beckarepo.sqlite"),
        inner: Mutex::new(Ok(db)),
    }
}

#[test]
fn f2_restore_operation_preserves_safety_backup_and_invalidates_session() {
    let original = database("restore-original");
    seed(&original);
    write_annotation(
        &original.connection,
        "w",
        "a.rs",
        &Annotation {
            note: "restore me".into(),
            revision: 1,
            ..Default::default()
        },
    )
    .unwrap();
    let backup = original.backup(None).unwrap();
    let source = Connection::open_with_flags(&backup, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    source
        .execute_batch("PRAGMA trusted_schema=OFF; BEGIN;")
        .unwrap();
    let destination = database("restore-destination");
    seed(&destination);
    write_annotation(
        &destination.connection,
        "w",
        "a.rs",
        &Annotation {
            note: "safety".into(),
            revision: 2,
            ..Default::default()
        },
    )
    .unwrap();
    let directory = destination.directory.clone();
    let store = store(destination);
    let state = Backend::default();
    let root = crate::validation_support::folder("restore-session");
    let session = Arc::new(crate::validation_support::session(&root));
    *state.session.lock().unwrap() = Some(session.clone());
    state
        .unsaved
        .store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(restore_into(&store, &state, &backup, &source)
        .unwrap_err()
        .contains("draft"));
    assert!(check_session(&session).is_ok());
    state
        .unsaved
        .store(false, std::sync::atomic::Ordering::SeqCst);
    assert!(restore_into(&store, &state, &backup, &source).unwrap());
    assert!(check_session(&session).is_err());
    let lock = store.inner.lock().unwrap();
    let restored = lock.as_ref().ok().unwrap();
    assert_eq!(
        read_annotation(&restored.connection, "w", "a.rs")
            .unwrap()
            .note,
        "restore me"
    );
    validate_database(&restored.connection).unwrap();
    let mut found_safety = false;
    for entry in std::fs::read_dir(directory.join("backups")).unwrap() {
        let con =
            Connection::open_with_flags(entry.unwrap().path(), OpenFlags::SQLITE_OPEN_READ_ONLY)
                .unwrap();
        if read_annotation(&con, "w", "a.rs").unwrap().note == "safety" {
            found_safety = true;
        }
    }
    assert!(found_safety);
}

#[test]
fn f2_restore_recovers_corrupt_store_preserving_original_files() {
    let original = database("recover-source");
    seed(&original);
    write_annotation(
        &original.connection,
        "w",
        "a.rs",
        &Annotation {
            note: "recovered".into(),
            revision: 1,
            ..Default::default()
        },
    )
    .unwrap();
    let backup = original.backup(None).unwrap();
    let source = Connection::open_with_flags(&backup, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    source
        .execute_batch("PRAGMA trusted_schema=OFF; BEGIN;")
        .unwrap();
    let directory = crate::validation_support::folder("recover-corrupt");
    for name in [
        "beckarepo.sqlite",
        "beckarepo.sqlite-wal",
        "beckarepo.sqlite-shm",
    ] {
        std::fs::write(directory.join(name), name).unwrap();
    }
    let store = Store {
        path: directory.join("beckarepo.sqlite"),
        inner: Mutex::new(Err("corrupted".into())),
    };
    assert!(restore_into(&store, &Backend::default(), &backup, &source).unwrap());
    let recovered = std::fs::read_dir(&directory)
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| {
            p.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("recovery-")
        })
        .unwrap();
    for name in [
        "beckarepo.sqlite",
        "beckarepo.sqlite-wal",
        "beckarepo.sqlite-shm",
    ] {
        assert_eq!(std::fs::read_to_string(recovered.join(name)).unwrap(), name);
    }
    let lock = store.inner.lock().unwrap();
    assert_eq!(
        read_annotation(&lock.as_ref().ok().unwrap().connection, "w", "a.rs")
            .unwrap()
            .note,
        "recovered"
    );
}

#[test]
fn f2_reassociation_guards_transaction_and_session() {
    let mut db = database("reassociate");
    seed(&db);
    let root = crate::validation_support::folder("reassociate-location");
    let previous = root.join("old-location").to_string_lossy().into_owned();
    let mut session = crate::validation_support::session(&root);
    session.worktree_id = "w".into();
    let session = Arc::new(session);
    let state = Backend::default();
    *state.session.lock().unwrap() = Some(session.clone());
    db.connection
        .execute(
            "INSERT INTO locations(path,worktree_id) VALUES(?1,'other'),(?2,'w')",
            params![previous, session.root.to_string_lossy()],
        )
        .unwrap();
    write_annotation(
        &db.connection,
        "other",
        "old.rs",
        &Annotation {
            note: "saved old".into(),
            revision: 1,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        reassociation_target(&db, &session, &previous).unwrap(),
        ("other".into(), 1)
    );
    std::fs::create_dir(&previous).unwrap();
    assert!(reassociate_into(&mut db, &state, &session, &previous, "other").is_err());
    std::fs::remove_dir(&previous).unwrap(); // Empty directory made by this test only.
    state
        .unsaved
        .store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(reassociate_into(&mut db, &state, &session, &previous, "other").is_err());
    state
        .unsaved
        .store(false, std::sync::atomic::Ordering::SeqCst);
    write_annotation(&db.connection, "w", "new.rs", &Annotation::default()).unwrap();
    assert!(reassociate_into(&mut db, &state, &session, &previous, "other").is_err());
    db.connection
        .execute("DELETE FROM annotations WHERE worktree_id='w'", [])
        .unwrap();
    assert!(reassociate_into(&mut db, &state, &session, &previous, "stale-id").is_err());
    assert!(reassociate_into(&mut db, &state, &session, &previous, "other").unwrap());
    assert!(check_session(&session).is_err());
    assert_eq!(
        db.connection
            .query_row::<String, _, _>(
                "SELECT worktree_id FROM locations WHERE path=?1",
                [session.root.to_string_lossy()],
                |r| r.get(0)
            )
            .unwrap(),
        "other"
    );
    assert_eq!(
        db.connection
            .query_row::<i64, _, _>(
                "SELECT count(*) FROM locations WHERE path=?1",
                [&previous],
                |r| r.get(0)
            )
            .unwrap(),
        0
    );
    assert_eq!(
        read_annotation(&db.connection, "other", "old.rs")
            .unwrap()
            .note,
        "saved old"
    );
    validate_database(&db.connection).unwrap();
}

#[test]
fn appearance_preferences_survive_restart_and_reject_invalid_updates() {
    let db = database("appearance");
    let directory = db.directory.clone();
    write_preference(&db.connection, "accent", "#9dcaff").unwrap();
    write_preference(&db.connection, "accent", "#ddb4f4").unwrap();
    write_preference(&db.connection, "density", "compact").unwrap();
    assert!(write_preference(&db.connection, "accent", "#1122xx").is_err());
    assert!(write_preference(&db.connection, "density", "mini").is_err());
    drop(db);
    let db = Database::open(directory).unwrap();
    for (key, expected) in [("accent", "#ddb4f4"), ("density", "compact")] {
        let value: String = db
            .connection
            .query_row("SELECT value FROM preferences WHERE key=?1", [key], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(value, expected);
    }
}
