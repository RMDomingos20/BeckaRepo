//! User-authored data and separately budgeted, regenerable Git metadata. No source text.
#[cfg(test)]
#[path = "storage_validation.rs"]
mod validation;
use crate::{check_session, get_entry, get_session, Backend};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};

const APPLICATION_ID: i64 = 0x4252504F;
const MAX_IMPORT: usize = 4 * 1024 * 1024;
pub struct Store {
    inner: Mutex<Result<Database, String>>,
    path: PathBuf,
}
struct Database {
    connection: Connection,
    directory: PathBuf,
}

impl Store {
    pub fn open(app: &tauri::AppHandle) -> Self {
        let directory = app.path().app_local_data_dir().map_err(|e| e.to_string());
        let path = directory
            .as_ref()
            .map(|p| p.join("beckarepo.sqlite"))
            .unwrap_or_default();
        let result = directory.and_then(Database::open);
        Self {
            inner: Mutex::new(result),
            path,
        }
    }
}
fn db_error(error: rusqlite::Error) -> String {
    format!("SQLite: {error}. Your changes were not confirmed; keep the draft and retry.")
}
fn stamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

impl Database {
    fn open(directory: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let mut connection =
            Connection::open(directory.join("beckarepo.sqlite")).map_err(db_error)?;
        connection
            .busy_timeout(Duration::from_secs(2))
            .map_err(db_error)?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL;",
            )
            .map_err(db_error)?;
        let page_size: i64 = connection
            .pragma_query_value(None, "page_size", |r| r.get(0))
            .map_err(db_error)?;
        connection
            .pragma_update(None, "max_page_count", 256 * 1024 * 1024 / page_size)
            .map_err(db_error)?;
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(db_error)?;
        if version > 2 {
            return Err("Database belongs to a newer BeckaRepo version".into());
        }
        if version == 0 {
            let existing: i64 = connection
                .query_row(
                    "SELECT count(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
                    [],
                    |row| row.get(0),
                )
                .map_err(db_error)?;
            if existing != 0 {
                return Err(
                    "Unrecognized database without a migration version; original data preserved"
                        .into(),
                );
            }
            let tx = connection
                .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
                .map_err(db_error)?;
            tx.execute_batch("
                CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE repositories(id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE worktrees(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id));
                CREATE TABLE locations(path TEXT PRIMARY KEY, worktree_id TEXT NOT NULL REFERENCES worktrees(id));
                CREATE TABLE annotations(worktree_id TEXT NOT NULL REFERENCES worktrees(id), path TEXT NOT NULL,
                    note TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(worktree_id,path));
                CREATE TABLE tags(worktree_id TEXT NOT NULL REFERENCES worktrees(id), name TEXT NOT NULL,
                    PRIMARY KEY(worktree_id,name));
                CREATE TABLE annotation_tags(worktree_id TEXT NOT NULL, path TEXT NOT NULL, tag TEXT NOT NULL,
                    PRIMARY KEY(worktree_id,path,tag),
                    FOREIGN KEY(worktree_id,path) REFERENCES annotations(worktree_id,path) ON DELETE CASCADE,
                    FOREIGN KEY(worktree_id,tag) REFERENCES tags(worktree_id,name));
                CREATE TABLE preferences(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE imports(worktree_id TEXT NOT NULL REFERENCES worktrees(id), source TEXT NOT NULL,
                    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(worktree_id,source));
                INSERT INTO schema_migrations(version) VALUES(1);
                PRAGMA application_id=1112690767;
                PRAGMA user_version=1;
            ").map_err(db_error)?;
            tx.commit().map_err(db_error)?;
        }
        validate_database(&connection)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(db_error)?;
        let mut db = Self {
            connection,
            directory,
        };
        // One consistent backup of the last persisted state per app launch, before edits.
        db.backup(None)?;
        migrate_git(&mut db.connection)?;
        validate_database(&db.connection)?;
        Ok(db)
    }
    fn backup(&self, protected: Option<&Path>) -> Result<PathBuf, String> {
        let directory = self.directory.join("backups");
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let path = directory.join(format!("beckarepo-{}.sqlite", stamp()));
        {
            let mut destination = Connection::open(&path).map_err(db_error)?;
            copy_database(&self.connection, &mut destination)?;
            // A portable backup must be self-contained. Read-only validation of a WAL-mode
            // copy otherwise creates orphan -wal/-shm files outside retention accounting.
            destination
                .pragma_update(None, "journal_mode", "DELETE")
                .map_err(db_error)?;
        }
        let copy = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(db_error)?;
        validate_database(&copy)?;
        drop(copy);
        let mut backups: Vec<_> = std::fs::read_dir(&directory)
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
            .map(|e| e.path())
            .filter(|p| {
                p.extension().is_some_and(|e| e == "sqlite")
                    && p.file_stem().and_then(|n| n.to_str()).is_some_and(|n| {
                        n.starts_with("beckarepo-") && n[10..].chars().all(|c| c.is_ascii_digit())
                    })
            })
            .collect();
        backups.sort();
        let excess = backups.len().saturating_sub(5);
        let protected = protected.and_then(|path| path.canonicalize().ok());
        for old in backups
            .into_iter()
            .filter(|path| {
                protected
                    .as_ref()
                    .is_none_or(|protected| path.canonicalize().ok().as_ref() != Some(protected))
            })
            .take(excess)
        {
            // Only app-generated regular backup files in this exact directory.
            if old.parent() == Some(directory.as_path()) {
                std::fs::remove_file(old).map_err(|e| e.to_string())?;
            }
        }
        Ok(path)
    }
}

// Bound cooperative backup work and lock retries; dropping an unfinished backup rolls it back.
fn copy_database(source: &Connection, destination: &mut Connection) -> Result<(), String> {
    let backup = rusqlite::backup::Backup::new(source, destination).map_err(db_error)?;
    let started = Instant::now();
    loop {
        if started.elapsed() > Duration::from_secs(30) {
            return Err("SQLite backup timed out. Close other instances and retry.".into());
        }
        match backup.step(128).map_err(db_error)? {
            rusqlite::backup::StepResult::Done => return Ok(()),
            rusqlite::backup::StepResult::More => {}
            rusqlite::backup::StepResult::Busy | rusqlite::backup::StepResult::Locked => {
                std::thread::sleep(Duration::from_millis(20))
            }
            _ => return Err("Unsupported SQLite backup state".into()),
        }
    }
}

fn validate_database(connection: &Connection) -> Result<(), String> {
    let app: i64 = connection
        .pragma_query_value(None, "application_id", |r| r.get(0))
        .map_err(db_error)?;
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(db_error)?;
    if app != APPLICATION_ID || !(1..=2).contains(&version) {
        return Err("Not a supported BeckaRepo database (schemas 1–2)".into());
    }
    let check: String = connection
        .pragma_query_value(None, "integrity_check", |r| r.get(0))
        .map_err(db_error)?;
    if check != "ok" {
        return Err(format!("Database integrity check failed: {check}"));
    }
    let mut fk = connection
        .prepare("PRAGMA foreign_key_check")
        .map_err(db_error)?;
    if fk
        .query([])
        .map_err(db_error)?
        .next()
        .map_err(db_error)?
        .is_some()
    {
        return Err("Database contains invalid references".into());
    }
    // Check every expected table/column before accepting a restore.
    connection.prepare("SELECT r.id,w.id,l.path,a.note,a.revision,t.name,at.tag,p.value,i.source,m.version
        FROM repositories r,worktrees w,locations l,annotations a,tags t,annotation_tags at,preferences p,imports i,schema_migrations m LIMIT 0").map_err(db_error)?;
    if version >= 2 {
        connection.prepare("SELECT r.common_dir,r.id,w.git_dir,w.id,w.repository_id,s.location_worktree_id,s.root,s.git_worktree_id,c.key,c.payload,c.created FROM git_repositories r,git_worktrees w,git_scopes s,git_cache c LIMIT 0").map_err(db_error)?;
    }
    let triggers: i64 = connection
        .query_row(
            "SELECT count(*) FROM sqlite_schema WHERE type IN ('trigger','view')",
            [],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    if triggers != 0 {
        return Err("Unexpected executable schema objects in backup".into());
    }
    Ok(())
}

fn migrate_git(connection: &mut Connection) -> Result<(), String> {
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(db_error)?;
    if version >= 2 {
        return Ok(());
    }
    let tx = connection.transaction().map_err(db_error)?;
    tx.execute_batch("
        CREATE TABLE git_repositories(common_dir TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE);
        CREATE TABLE git_worktrees(git_dir TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE,
            repository_id TEXT NOT NULL REFERENCES git_repositories(id));
        CREATE TABLE git_scopes(location_worktree_id TEXT NOT NULL REFERENCES worktrees(id), root TEXT NOT NULL,
            git_worktree_id TEXT NOT NULL REFERENCES git_worktrees(id), PRIMARY KEY(location_worktree_id,root));
        CREATE TABLE git_cache(key TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=8388608), created INTEGER NOT NULL);
        INSERT INTO schema_migrations(version) VALUES(2);
        PRAGMA user_version=2;
    ").map_err(db_error)?;
    tx.commit().map_err(db_error)
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentity {
    pub repository_id: String,
    pub worktree_id: String,
}

pub fn associate_git(
    app: &tauri::AppHandle,
    session: &crate::Session,
    root: &Path,
    git_dir: &Path,
    common: &Path,
) -> Result<GitIdentity, String> {
    check_annotation_session(session)?;
    let git_dir = git_dir
        .canonicalize()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    let common = common
        .canonicalize()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    with_db(app, |db| {
        let tx = db.connection.transaction().map_err(db_error)?;
        tx.execute("INSERT OR IGNORE INTO git_repositories(common_dir,id) VALUES(?1,lower(hex(randomblob(16))))", [&common]).map_err(db_error)?;
        let repository_id: String = tx
            .query_row(
                "SELECT id FROM git_repositories WHERE common_dir=?1",
                [&common],
                |r| r.get(0),
            )
            .map_err(db_error)?;
        tx.execute("INSERT INTO git_worktrees(git_dir,id,repository_id) VALUES(?1,lower(hex(randomblob(16))),?2) ON CONFLICT(git_dir) DO UPDATE SET repository_id=excluded.repository_id", params![git_dir,repository_id]).map_err(db_error)?;
        let worktree_id: String = tx
            .query_row(
                "SELECT id FROM git_worktrees WHERE git_dir=?1",
                [&git_dir],
                |r| r.get(0),
            )
            .map_err(db_error)?;
        tx.execute("INSERT INTO git_scopes(location_worktree_id,root,git_worktree_id) VALUES(?1,?2,?3) ON CONFLICT(location_worktree_id,root) DO UPDATE SET git_worktree_id=excluded.git_worktree_id", params![session.worktree_id,root.to_string_lossy(),worktree_id]).map_err(db_error)?;
        check_session(session)?;
        tx.commit().map_err(db_error)?;
        Ok(GitIdentity {
            repository_id,
            worktree_id,
        })
    })
}

fn cache_key(key: &str) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(key.as_bytes()))
}
pub fn read_git_cache(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
    with_db(app, |db| read_git_cache_from(db, key))
}
fn read_git_cache_from(db: &Database, key: &str) -> Result<Option<String>, String> {
    db.connection.query_row(
        "SELECT payload FROM git_cache WHERE key=?1 AND created>=unixepoch()-604800 AND length(CAST(payload AS BLOB))<=8388608",
        [cache_key(key)], |r| r.get(0)).optional().map_err(db_error)
}
pub fn write_git_cache(app: &tauri::AppHandle, key: &str, payload: &str) -> Result<(), String> {
    with_db(app, |db| write_git_cache_into(db, key, payload))
}
fn write_git_cache_into(db: &mut Database, key: &str, payload: &str) -> Result<(), String> {
    if payload.len() > 8 * 1024 * 1024 {
        return Err("Git cache entry exceeds 8 MiB".into());
    }
    let tx = db.connection.transaction().map_err(db_error)?;
    tx.execute(
        "DELETE FROM git_cache WHERE created<unixepoch()-604800 OR key=?1",
        [cache_key(key)],
    )
    .map_err(db_error)?;
    loop {
        let (count, size): (i64, i64) = tx
            .query_row(
                "SELECT count(*),coalesce(sum(length(CAST(payload AS BLOB))),0) FROM git_cache",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(db_error)?;
        if count < 64 && size + payload.len() as i64 <= 64 * 1024 * 1024 {
            break;
        }
        tx.execute("DELETE FROM git_cache WHERE key=(SELECT key FROM git_cache ORDER BY created,key LIMIT 1)", []).map_err(db_error)?;
    }
    tx.execute(
        "INSERT INTO git_cache(key,payload,created) VALUES(?1,?2,unixepoch())",
        params![cache_key(key), payload],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)
}

fn with_db<T>(
    app: &tauri::AppHandle,
    f: impl FnOnce(&mut Database) -> Result<T, String>,
) -> Result<T, String> {
    let store = app.state::<Store>();
    let mut locked = store.inner.lock().map_err(|e| e.to_string())?;
    let db = locked.as_mut().map_err(|error| error.clone())?;
    f(db)
}

fn check_annotation_session(session: &crate::Session) -> Result<(), String> {
    check_session(session)?;
    if session.worktree_id.starts_with("unavailable:") {
        return Err("Persistence was unavailable when this repository opened. Resolve the database error and refresh the repository.".into());
    }
    Ok(())
}

pub fn identify(app: &tauri::AppHandle, root: &Path) -> Result<(String, String), String> {
    with_db(app, |db| {
        let location = root.to_string_lossy();
        let tx = db.connection.transaction().map_err(db_error)?;
        let existing = tx.query_row("SELECT w.repository_id,w.id FROM locations l JOIN worktrees w ON w.id=l.worktree_id WHERE l.path=?1",
            [location.as_ref()], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).optional().map_err(db_error)?;
        let identity = if let Some(existing) = existing {
            existing
        } else {
            let repository: String = tx
                .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
                .map_err(db_error)?;
            let worktree: String = tx
                .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
                .map_err(db_error)?;
            tx.execute("INSERT INTO repositories(id) VALUES(?1)", [&repository])
                .map_err(db_error)?;
            tx.execute(
                "INSERT INTO worktrees(id,repository_id) VALUES(?1,?2)",
                params![worktree, repository],
            )
            .map_err(db_error)?;
            tx.execute(
                "INSERT INTO locations(path,worktree_id) VALUES(?1,?2)",
                params![location, worktree],
            )
            .map_err(db_error)?;
            (repository, worktree)
        };
        tx.commit().map_err(db_error)?;
        Ok(identity)
    })
}

#[tauri::command]
pub fn saved_locations(
    app: tauri::AppHandle,
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
) -> Result<Vec<String>, String> {
    let session = get_session(&state, &snapshot_id)?;
    check_annotation_session(&session)?;
    with_db(&app, |db| {
        let mut statement = db
            .connection
            .prepare("SELECT path FROM locations WHERE worktree_id<>?1 ORDER BY path LIMIT 1001")
            .map_err(db_error)?;
        let paths = statement
            .query_map([&session.worktree_id], |row| row.get::<_, String>(0))
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        if paths.len() > 1000 {
            return Err(
                "More than 1000 saved locations; reassociation requires a narrower query".into(),
            );
        }
        Ok(paths)
    })
}

/// Move only a location binding. Never merge or overwrite two sets of notes.
#[tauri::command]
pub async fn reassociate_location(
    app: tauri::AppHandle,
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    previous_path: String,
) -> Result<bool, String> {
    let session = get_session(&state, &snapshot_id)?;
    check_annotation_session(&session)?;
    if state.unsaved.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("Save or discard drafts before reassociating".into());
    }
    if previous_path.len() > 32768 {
        return Err("Invalid saved location".into());
    }
    if state.busy.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return Err("Wait for the current operation".into());
    }
    let state = Arc::clone(state.inner());
    let guard = crate::BusyGuard(state.clone(), false);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        with_db(&app, |db| {
            let (old_id, saved) = reassociation_target(db, &session, &previous_path)?;
            if rfd::MessageDialog::new().set_title("Reassociar pasta / Reassociate folder")
                .set_description(format!("{previous_path}\n→ {}\n\n{saved} anotações / annotations.\nVincular a pasta atual aos dados anteriores? Um backup será criado e a sessão será fechada.\nLink the current folder to the previous data? A backup will be created and the session will close.",session.root.display()))
                .set_buttons(rfd::MessageButtons::YesNo).show()!=rfd::MessageDialogResult::Yes { return Ok(false); }
            reassociate_into(db, &state, &session, &previous_path, &old_id)
        })
    }).await.map_err(|e|e.to_string())?
}

fn reassociation_target(
    db: &Database,
    session: &crate::Session,
    previous_path: &str,
) -> Result<(String, i64), String> {
    check_annotation_session(session)?;
    let old_id: String = db
        .connection
        .query_row(
            "SELECT worktree_id FROM locations WHERE path=?1",
            [previous_path],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    if old_id == session.worktree_id {
        return Err("This location already belongs to the current worktree".into());
    }
    // A missing path is required; an inaccessible path is not proof it was moved.
    match std::fs::metadata(previous_path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        _ => {
            return Err(
                "The previous folder must no longer exist and must be accessible for this check"
                    .into(),
            )
        }
    }
    let count: i64 = db
        .connection
        .query_row(
            "SELECT count(*) FROM annotations WHERE worktree_id=?1",
            [&session.worktree_id],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    if count != 0 {
        return Err("The current folder already has saved annotations. Export or back up these notes before choosing another identity; automatic merging is disabled".into());
    }
    let saved: i64 = db
        .connection
        .query_row(
            "SELECT count(*) FROM annotations WHERE worktree_id=?1",
            [&old_id],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    Ok((old_id, saved))
}
fn reassociate_into(
    db: &mut Database,
    state: &Backend,
    session: &crate::Session,
    previous_path: &str,
    old_id: &str,
) -> Result<bool, String> {
    check_annotation_session(session)?;
    if state.unsaved.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("Unsaved draft; reassociation cancelled".into());
    }
    let (current_old_id, _) = reassociation_target(db, session, previous_path)?;
    if current_old_id != old_id {
        return Err("Saved location changed during confirmation".into());
    }
    db.backup(None)?;
    let tx = db
        .connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(db_error)?;
    let unchanged: String = tx
        .query_row(
            "SELECT worktree_id FROM locations WHERE path=?1",
            [previous_path],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    let count: i64 = tx
        .query_row(
            "SELECT count(*) FROM annotations WHERE worktree_id=?1",
            [&session.worktree_id],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    if unchanged != old_id || count != 0 {
        return Err("Saved data changed during confirmation; reassociation cancelled".into());
    }
    let current = session.root.to_string_lossy();
    let changed = tx
        .execute(
            "UPDATE locations SET worktree_id=?1 WHERE path=?2 AND worktree_id=?3",
            params![old_id, current, session.worktree_id],
        )
        .map_err(db_error)?;
    if changed != 1 {
        return Err("Location changed; reopen the folder".into());
    }
    tx.execute(
        "DELETE FROM locations WHERE path=?1 AND worktree_id=?2",
        params![previous_path, old_id],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    crate::invalidate(state)?;
    Ok(true)
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Annotation {
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub revision: i64,
}
fn validate_annotation(path: &str, annotation: &Annotation) -> Result<(), String> {
    if path.is_empty()
        || path.len() > 4096
        || path.contains(['\\', ':', '\0'])
        || path
            .split('/')
            .any(|c| c.is_empty() || c == "." || c == "..")
        || beckarepo_core::policy::is_sensitive_path(path)
    {
        return Err("Invalid annotation path".into());
    }
    if annotation.note.len() > 64 * 1024
        || annotation.tags.len() > 32
        || annotation.revision < 0
        || annotation.tags.iter().any(|t| {
            t.trim() != t || t.is_empty() || t.len() > 80 || t.chars().any(char::is_control)
        })
        || annotation.tags.iter().collect::<HashSet<_>>().len() != annotation.tags.len()
    {
        return Err("Notes allow 64 KiB and up to 32 distinct tags of 80 bytes".into());
    }
    Ok(())
}
fn read_annotation(
    connection: &Connection,
    worktree: &str,
    path: &str,
) -> Result<Annotation, String> {
    let mut annotation = connection
        .query_row(
            "SELECT note,revision FROM annotations WHERE worktree_id=?1 AND path=?2",
            params![worktree, path],
            |r| {
                Ok(Annotation {
                    note: r.get(0)?,
                    revision: r.get(1)?,
                    tags: vec![],
                })
            },
        )
        .optional()
        .map_err(db_error)?
        .unwrap_or_default();
    let mut query = connection
        .prepare("SELECT tag FROM annotation_tags WHERE worktree_id=?1 AND path=?2 ORDER BY tag")
        .map_err(db_error)?;
    annotation.tags = query
        .query_map(params![worktree, path], |r| r.get(0))
        .map_err(db_error)?
        .collect::<Result<_, _>>()
        .map_err(db_error)?;
    validate_annotation(path, &annotation)?;
    Ok(annotation)
}
fn write_annotation(
    connection: &Connection,
    worktree: &str,
    path: &str,
    annotation: &Annotation,
) -> Result<(), String> {
    connection.execute("INSERT INTO annotations(worktree_id,path,note,revision) VALUES(?1,?2,?3,?4)
        ON CONFLICT(worktree_id,path) DO UPDATE SET note=excluded.note,revision=excluded.revision,updated_at=CURRENT_TIMESTAMP",
        params![worktree,path,annotation.note,annotation.revision]).map_err(db_error)?;
    connection
        .execute(
            "DELETE FROM annotation_tags WHERE worktree_id=?1 AND path=?2",
            params![worktree, path],
        )
        .map_err(db_error)?;
    for tag in &annotation.tags {
        connection
            .execute(
                "INSERT OR IGNORE INTO tags(worktree_id,name) VALUES(?1,?2)",
                params![worktree, tag],
            )
            .map_err(db_error)?;
        connection
            .execute(
                "INSERT INTO annotation_tags(worktree_id,path,tag) VALUES(?1,?2,?3)",
                params![worktree, path, tag],
            )
            .map_err(db_error)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn load_annotations(
    app: tauri::AppHandle,
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    path: String,
) -> Result<Annotation, String> {
    let session = get_session(&state, &snapshot_id)?;
    get_entry(&session, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        with_db(&app, |db| {
            check_annotation_session(&session)?;
            read_annotation(&db.connection, &session.worktree_id, &path)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn save_annotation(
    app: tauri::AppHandle,
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    path: String,
    annotation: Annotation,
) -> Result<Annotation, String> {
    validate_annotation(&path, &annotation)?;
    let session = get_session(&state, &snapshot_id)?;
    get_entry(&session, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        with_db(&app, |db| save_into(db, &session, &path, annotation))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn save_into(
    db: &mut Database,
    session: &crate::Session,
    path: &str,
    annotation: Annotation,
) -> Result<Annotation, String> {
    validate_annotation(path, &annotation)?;
    check_annotation_session(session)?;
    let tx = db
        .connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(db_error)?;
    let current = read_annotation(&tx, &session.worktree_id, path)?;
    if current.revision != annotation.revision {
        return Err("Annotation changed elsewhere. Reload the saved version before retrying; your draft has been kept.".into());
    }
    let next = Annotation {
        revision: current
            .revision
            .checked_add(1)
            .ok_or("Annotation revision overflow")?,
        ..annotation
    };
    write_annotation(&tx, &session.worktree_id, path, &next)?;
    check_annotation_session(session)?;
    tx.commit().map_err(db_error)?;
    Ok(next)
}

#[tauri::command]
pub async fn import_annotations(
    app: tauri::AppHandle,
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    source: String,
    data: String,
) -> Result<usize, String> {
    let session = get_session(&state, &snapshot_id)?;
    // Only the exact old key for this canonical location is imported automatically.
    if source != format!("beckarepo_tags_{}", session.snapshot.repository_id)
        || data.len() > MAX_IMPORT
    {
        return Err("Invalid legacy import source or size".into());
    }
    tauri::async_runtime::spawn_blocking(move || import_data(&app, &session, &source, &data))
        .await
        .map_err(|e| e.to_string())?
}

fn import_data(
    app: &tauri::AppHandle,
    session: &crate::Session,
    source: &str,
    data: &str,
) -> Result<usize, String> {
    with_db(app, |db| import_into(db, session, source, data))
}

fn import_into(
    db: &mut Database,
    session: &crate::Session,
    source: &str,
    data: &str,
) -> Result<usize, String> {
    if data.len() > MAX_IMPORT {
        return Err("Legacy import exceeds 4 MiB".into());
    }
    let annotations: BTreeMap<String, Annotation> =
        serde_json::from_str(data).map_err(|e| e.to_string())?;
    if annotations.len() > 2000 {
        return Err("Legacy import exceeds 2,000 annotations".into());
    }
    for (path, value) in &annotations {
        validate_annotation(path, value)?;
    }
    check_annotation_session(session)?;
    let tx = db
        .connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(db_error)?;
    let imported: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM imports WHERE worktree_id=?1 AND source=?2)",
            params![session.worktree_id, source],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    if imported {
        return Ok(0);
    }
    let mut count = 0;
    for (path, mut value) in annotations {
        if read_annotation(&tx, &session.worktree_id, &path)?.revision == 0 {
            value.revision = 1;
            write_annotation(&tx, &session.worktree_id, &path, &value)?;
            count += 1;
        }
    }
    tx.execute(
        "INSERT INTO imports(worktree_id,source) VALUES(?1,?2)",
        params![session.worktree_id, source],
    )
    .map_err(db_error)?;
    check_annotation_session(session)?;
    tx.commit().map_err(db_error)?;
    Ok(count)
}

#[tauri::command]
pub async fn import_legacy_file(
    app: tauri::AppHandle,
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
) -> Result<Option<usize>, String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    if state.unsaved.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("Save or discard drafts before importing".into());
    }
    let session = get_session(&state, &snapshot_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = rfd::FileDialog::new()
            .set_title("Import annotations into the open repository")
            .add_filter("JSON", &["json"])
            .pick_file()
        else {
            return Ok(None);
        };
        let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
        let mut data = String::new();
        file.take(MAX_IMPORT as u64 + 1)
            .read_to_string(&mut data)
            .map_err(|e| e.to_string())?;
        if data.len() > MAX_IMPORT {
            return Err("Legacy import exceeds 4 MiB".into());
        }
        let source = format!("json:{:x}", Sha256::digest(data.as_bytes()));
        import_data(&app, &session, &source, &data).map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_preferences(
    app: tauri::AppHandle,
    legacy_language: Option<String>,
) -> Result<BTreeMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_db(&app, |db| {
            if let Some(lang) = legacy_language.filter(|l| l == "pt" || l == "en") {
                db.connection
                    .execute(
                        "INSERT OR IGNORE INTO preferences(key,value) VALUES('language',?1)",
                        [lang],
                    )
                    .map_err(db_error)?;
            }
            let mut query = db
                .connection
                .prepare("SELECT key,value FROM preferences")
                .map_err(db_error)?;
            let result = query
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                .map_err(db_error)?
                .collect::<Result<_, _>>()
                .map_err(db_error);
            result
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
fn write_preference(connection: &Connection, key: &str, value: &str) -> Result<(), String> {
    let valid = match key {
        "language" => matches!(value, "pt" | "en"),
        "showTree" | "showDetail" => matches!(value, "true" | "false"),
        "density" => matches!(value, "comfortable" | "compact"),
        "accent" => value
            .strip_prefix('#')
            .is_some_and(|hex| hex.len() == 6 && hex.bytes().all(|c| c.is_ascii_hexdigit())),
        _ => false,
    };
    if !valid {
        return Err("Invalid preference".into());
    }
    connection.execute(
        "INSERT INTO preferences(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    ).map_err(db_error)?;
    Ok(())
}

#[tauri::command]
pub async fn set_preference(
    app: tauri::AppHandle,
    key: String,
    value: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_db(&app, |db| write_preference(&db.connection, &key, &value))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn database_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let locked = store.inner.lock().map_err(|e| e.to_string())?;
        Ok(serde_json::json!({"path":store.path,"error":locked.as_ref().err(),"schemaVersion":2}))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn backup_database(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_db(&app, |db| {
            db.backup(None).map(|p| p.to_string_lossy().into_owned())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn restore_database(
    app: tauri::AppHandle,
    state: State<'_, Arc<Backend>>,
) -> Result<bool, String> {
    let state = Arc::clone(state.inner());
    if state.unsaved.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("Save or discard drafts before restoring".into());
    }
    if state.busy.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return Err("Wait for the current analysis before restoring".into());
    }
    let guard = crate::BusyGuard(state.clone(), false);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let Some(path) = rfd::FileDialog::new().set_title("Restore BeckaRepo backup").add_filter("SQLite",&["sqlite"]).pick_file() else { return Ok(false); };
        if std::fs::metadata(&path).map_err(|e|e.to_string())?.len() > 256 * 1024 * 1024 { return Err("Backup exceeds 256 MiB".into()); }
        let source = Connection::open_with_flags(&path,OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(db_error)?;
        source.execute_batch("PRAGMA trusted_schema=OFF; BEGIN;").map_err(db_error)?;
        validate_database(&source)?;
        if rfd::MessageDialog::new().set_title("Restore BeckaRepo")
            .set_description("Replace all saved notes, tags and preferences with this backup? A safety backup will be created first. The current repository will close.")
            .set_buttons(rfd::MessageButtons::YesNo).show() != rfd::MessageDialogResult::Yes { return Ok(false); }
        restore_into(&app.state::<Store>(), &state, &path, &source)
    }).await.map_err(|e|e.to_string())?
}

fn restore_into(
    store: &Store,
    state: &Backend,
    path: &Path,
    source: &Connection,
) -> Result<bool, String> {
    // A draft may arrive while the file/confirmation dialog is open.
    if state.unsaved.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("Unsaved draft; restore cancelled".into());
    }
    validate_database(source)?;
    if store
        .path
        .canonicalize()
        .ok()
        .is_some_and(|p| path.canonicalize().ok().as_ref() == Some(&p))
    {
        return Err("Choose a backup file, not the active database".into());
    }
    let mut locked = store.inner.lock().map_err(|e| e.to_string())?;
    if locked.is_err() {
        // Recover an unavailable database without overwriting its original bytes.
        // Stage and validate a full SQLite copy first, then preserve all damaged sidecars.
        let directory = store
            .path
            .parent()
            .ok_or("Application data directory unavailable")?
            .to_path_buf();
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let staged = directory.join(format!("restore-{}.sqlite", stamp()));
        {
            let mut destination = Connection::open(&staged).map_err(db_error)?;
            copy_database(source, &mut destination)?;
            validate_database(&destination)?;
            destination
                .pragma_update(None, "journal_mode", "DELETE")
                .map_err(db_error)?;
        }
        let preserved = directory.join(format!("recovery-{}", stamp()));
        std::fs::create_dir(&preserved).map_err(|e| e.to_string())?;
        for name in [
            "beckarepo.sqlite",
            "beckarepo.sqlite-wal",
            "beckarepo.sqlite-shm",
        ] {
            let original = directory.join(name);
            if original.exists() {
                std::fs::rename(&original, preserved.join(name)).map_err(|e| {
                    format!(
                        "Recovery stopped: {e}. Original data: {}. Staged backup: {}",
                        preserved.display(),
                        staged.display()
                    )
                })?;
            }
        }
        std::fs::rename(&staged, &store.path).map_err(|e| {
            format!(
                "Recovery stopped: {e}. Original data: {}. Staged backup: {}",
                preserved.display(),
                staged.display()
            )
        })?;
        *locked = Database::open(directory);
        locked.as_ref().map_err(|e| e.clone())?;
        crate::invalidate(state)?;
        return Ok(true);
    }
    let db = locked.as_mut().map_err(|e| e.clone())?;
    {
        let safety = db.backup(Some(&path))?;
        // Use the same validated, read-locked source connection; do not reopen a mutable path.
        let result = copy_database(source, &mut db.connection);
        if let Err(error) = result {
            return Err(format!(
                "Restore failed: {error}. Safety backup: {}",
                safety.display()
            ));
        }
        crate::invalidate(state)?;
        validate_database(&db.connection)?;
        migrate_git(&mut db.connection)?;
        Ok(true)
    }
}
