//! Read-only Git queries. No shell, content filters, external diff, or network access.
#[cfg(test)]
#[path = "git_validation.rs"]
mod validation;
use crate::{check_session, get_entry, get_session, Backend, Session};
use beckarepo_core::{policy, repository};
use serde::{Deserialize, Serialize};
pub mod insights;
use std::{
    collections::VecDeque,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::State;

const MAX_COMMITS: usize = 200;
const MAX_OUTPUT: usize = 8 * 1024 * 1024;
const ALGORITHM: &str = "file-history-v2";

struct Job {
    id: String,
    cancelled: Arc<AtomicBool>,
}
#[derive(Default)]
pub struct GitState {
    active: Mutex<Option<Job>>,
    gate: Mutex<()>,
    cache: Mutex<VecDeque<(String, History, usize)>>,
}
impl GitState {
    pub fn invalidate(&self) {
        if let Ok(mut active) = self.active.lock() {
            if let Some(job) = active.take() {
                job.cancelled.store(true, Ordering::SeqCst);
            }
        }
        if let Ok(mut cache) = self.cache.lock() {
            cache.clear();
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    root: String,
    git_dir: String,
    common_dir: String,
    branch: Option<String>,
    head: Option<String>,
    shallow: bool,
    linked_worktree: bool,
    tracked_in_index: bool,
    staged_change: bool,
    working_copy: String,
    identity: Option<crate::storage::GitIdentity>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    hash: String,
    timestamp: u64,
    additions: u64,
    deletions: u64,
    binary: bool,
    path: String,
    previous_path: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    since: u64,
    until: u64,
    commits: Vec<Commit>,
    additions: u64,
    deletions: u64,
    churn: u64,
    frequency: usize,
    last_change: Option<u64>,
    truncated: bool,
    excluded_records: usize,
    binary_commits: usize,
    renames: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultData {
    snapshot_id: String,
    query_id: String,
    status: &'static str,
    context: Option<Context>,
    history: Option<History>,
    cached: bool,
    warnings: Vec<String>,
}

struct Runner<'a> {
    executable: PathBuf,
    root: PathBuf,
    session: &'a Session,
    cancelled: &'a AtomicBool,
    started: Instant,
}
struct ChildGuard(std::process::Child);
impl std::ops::Deref for ChildGuard {
    type Target = std::process::Child;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl std::ops::DerefMut for ChildGuard {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}
impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
impl Runner<'_> {
    fn check(&self) -> Result<(), String> {
        check_session(self.session)?;
        if self.cancelled.load(Ordering::SeqCst) {
            return Err("Git query cancelled".into());
        }
        if self.started.elapsed() > Duration::from_secs(30) {
            return Err("Git query exceeded 30 seconds; narrow the time window".into());
        }
        Ok(())
    }
    fn run(&self, args: &[&str], limit: usize) -> Result<(bool, Vec<u8>), String> {
        self.check()?;
        let mut command = Command::new(&self.executable);
        command
            .current_dir(&self.root)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // Ignore inherited repository/config overrides and avoid current-directory executable lookup.
        for (key, _) in std::env::vars_os() {
            if key
                .to_string_lossy()
                .to_ascii_uppercase()
                .starts_with("GIT_")
            {
                command.env_remove(key);
            }
        }
        let null = if cfg!(windows) { "NUL" } else { "/dev/null" };
        let normalized_root = self.root.to_string_lossy().replace('\\', "/");
        let safe_root = if let Some(unc) = normalized_root.strip_prefix("//?/UNC/") {
            format!("//{unc}")
        } else {
            normalized_root.trim_start_matches("//?/").to_string()
        };
        command
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", null)
            .env("GIT_OPTIONAL_LOCKS", "0")
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_NO_LAZY_FETCH", "1")
            .env("GIT_NO_REPLACE_OBJECTS", "1")
            .env("GIT_ATTR_NOSYSTEM", "1")
            .env("LC_ALL", "C")
            .args(["--no-pager", "--no-optional-locks", "-c", "safe.directory="])
            // Scope ownership authorization to the explicitly selected repository for this process.
            .arg("-c")
            .arg(format!("safe.directory={safe_root}"))
            .args([
                "-c",
                "core.fsmonitor=false",
                "-c",
                "core.untrackedCache=false",
                "-c",
                "credential.helper=",
                "-c",
                "protocol.allow=never",
                "-c",
                "log.showSignature=false",
                "-c",
                "diff.renameLimit=200",
                "-c",
                "i18n.logOutputEncoding=UTF-8",
                "-c",
                "core.quotePath=false",
            ])
            .arg("-c")
            .arg(format!("core.hooksPath={null}"))
            .arg("-c")
            .arg(format!("core.attributesFile={null}"))
            .args(args);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let mut child = ChildGuard(
            command
                .spawn()
                .map_err(|e| format!("Cannot start Git: {e}"))?,
        );
        let stdout = child.stdout.take().ok_or("Git stdout unavailable")?;
        let stderr = child.stderr.take().ok_or("Git stderr unavailable")?;
        let overflow = Arc::new(AtomicBool::new(false));
        let read = |pipe: Box<dyn Read + Send>, cap: usize, overflow: Arc<AtomicBool>| {
            std::thread::spawn(move || {
                let mut bytes = Vec::new();
                let result = pipe.take(cap as u64 + 1).read_to_end(&mut bytes);
                if bytes.len() > cap {
                    overflow.store(true, Ordering::SeqCst);
                }
                result.map(|_| bytes).map_err(|e| e.to_string())
            })
        };
        let out = read(Box::new(stdout), limit, overflow.clone());
        let err = read(Box::new(stderr), 64 * 1024, overflow.clone());
        let result = loop {
            if let Err(error) = self.check() {
                break Err(error);
            }
            if overflow.load(Ordering::SeqCst) {
                break Err("Git output exceeded its byte budget".into());
            }
            match child.try_wait() {
                Ok(Some(status)) => break Ok(status.success()),
                Err(error) => break Err(error.to_string()),
                Ok(None) => std::thread::sleep(Duration::from_millis(15)),
            }
        };
        if result.is_err() {
            let _ = child.kill();
        }
        let _ = child.wait();
        let bytes = out.join().map_err(|_| "Git reader failed")??;
        let errors = err.join().map_err(|_| "Git error reader failed")??;
        let success = result?;
        if overflow.load(Ordering::SeqCst) {
            return Err("Git output exceeded its byte budget".into());
        }
        self.check()?;
        if !success
            && !args.contains(&"--quiet")
            && !args.contains(&"-q")
            && !args.contains(&"--error-unmatch")
        {
            return Err(format!(
                "Git: {}",
                String::from_utf8_lossy(&errors)
                    .chars()
                    .take(1500)
                    .collect::<String>()
            ));
        }
        Ok((success, bytes))
    }
    fn text(&self, args: &[&str]) -> Result<String, String> {
        let (_, bytes) = self.run(args, 32 * 1024)?;
        String::from_utf8(bytes)
            .map(|s| s.trim_end_matches(['\r', '\n']).into())
            .map_err(|_| "Git metadata is not UTF-8".into())
    }
}

fn candidate_root(root: &Path) -> Option<PathBuf> {
    root.ancestors()
        .find(|path| path.join(".git").exists())
        .map(Path::to_path_buf)
}
fn git_executable(root: &Path) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .filter(|p| p.is_absolute())
        .filter_map(|p| {
            p.join(if cfg!(windows) { "git.exe" } else { "git" })
                .canonicalize()
                .ok()
        })
        .find(|p| p.is_file() && !p.starts_with(root))
}
fn hash(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|b| b.is_ascii_hexdigit())
}

fn shallow_signature(common: &str) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let path = Path::new(common).join("shallow");
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok("full".into()),
        Err(error) => return Err(error.to_string()),
    };
    let mut bytes = Vec::new();
    file.take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("Shallow boundary exceeds 2 MiB".into());
    }
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn parse_history(bytes: &[u8], since: u64, until: u64) -> Result<History, String> {
    let text = std::str::from_utf8(bytes).map_err(|_| "Git history contains non-UTF-8 paths")?;
    let mut tokens = text.split('\0').peekable();
    let mut commits: Vec<Commit> = Vec::new();
    let mut current: Option<(String, u64)> = None;
    let mut excluded = 0;
    let mut headers = 0;
    while let Some(token) = tokens.next() {
        // Git inserts LF between the pretty header and numstat output, not within paths.
        let token = token.trim_start_matches('\n');
        if token.is_empty() {
            continue;
        }
        if let Some(id) = token.strip_prefix('\u{1e}') {
            if !hash(id) {
                return Err("Invalid commit header in Git output".into());
            }
            let timestamp = tokens
                .next()
                .ok_or("Missing commit timestamp")?
                .parse::<u64>()
                .map_err(|_| "Invalid commit timestamp")?;
            headers += 1;
            current = Some((id.into(), timestamp));
            continue;
        }
        let mut fields = token.splitn(3, '\t');
        let added = fields.next().ok_or("Invalid Git numstat")?;
        let deleted = fields.next().ok_or("Invalid Git numstat")?;
        let mut path = fields.next().ok_or("Invalid Git numstat path")?;
        let previous = if path.is_empty() {
            let old = tokens.next().ok_or("Missing rename source")?;
            path = tokens.next().ok_or("Missing rename destination")?;
            Some(old.to_string())
        } else {
            None
        };
        if path.len() > 4096 || previous.as_ref().is_some_and(|p| p.len() > 4096) {
            return Err("Historical Git path exceeds 4 KiB".into());
        }
        let (id, timestamp) = current.as_ref().ok_or("Git stats without commit header")?;
        if policy::is_sensitive_path(path)
            || previous
                .as_ref()
                .is_some_and(|p| policy::is_sensitive_path(p))
        {
            excluded += 1;
            continue;
        }
        let binary = added == "-" && deleted == "-";
        let additions = if binary {
            0
        } else {
            added.parse::<u64>().map_err(|_| "Invalid Git additions")?
        };
        let deletions = if binary {
            0
        } else {
            deleted
                .parse::<u64>()
                .map_err(|_| "Invalid Git deletions")?
        };
        // --follow is scoped to one file. Reject unexpected multi-record commits rather than double counting.
        if commits.last().is_some_and(|commit| commit.hash == *id) {
            return Err("Unexpected multiple file records in Git history".into());
        }
        if headers <= MAX_COMMITS {
            commits.push(Commit {
                hash: id.clone(),
                timestamp: *timestamp,
                additions,
                deletions,
                binary,
                path: path.into(),
                previous_path: previous,
            });
        }
    }
    let additions = commits
        .iter()
        .try_fold(0u64, |sum, c| sum.checked_add(c.additions))
        .ok_or("Git additions overflow")?;
    let deletions = commits
        .iter()
        .try_fold(0u64, |sum, c| sum.checked_add(c.deletions))
        .ok_or("Git deletions overflow")?;
    Ok(History {
        since,
        until,
        churn: additions
            .checked_add(deletions)
            .ok_or("Git churn overflow")?,
        frequency: commits.len(),
        last_change: commits.iter().map(|c| c.timestamp).max(),
        binary_commits: commits.iter().filter(|c| c.binary).count(),
        renames: commits.iter().filter(|c| c.previous_path.is_some()).count(),
        commits,
        additions,
        deletions,
        truncated: headers > MAX_COMMITS,
        excluded_records: excluded,
    })
}

fn working_copy_status(
    runner: &Runner<'_>,
    path: &str,
    relative: &str,
    literal: &str,
    tracked: bool,
) -> Result<String, String> {
    Ok(if !tracked {
        "untracked".to_owned()
    } else {
        let (_, bytes) = runner.run(&["ls-files", "--stage", "-z", "--", &literal], 32 * 1024)?;
        let records: Vec<_> = bytes.split(|b| *b == 0).filter(|b| !b.is_empty()).collect();
        let header = records
            .first()
            .and_then(|r| r.split(|b| *b == b'\t').next())
            .and_then(|r| std::str::from_utf8(r).ok())
            .unwrap_or("");
        let fields: Vec<_> = header.split(' ').collect();
        if records.len() != 1 || fields.len() != 3 || fields[2] != "0" {
            "conflict".to_owned()
        } else if !["100644", "100755"].contains(&fields[0]) {
            "unsupported".to_owned()
        } else {
            repository::ensure_revision(&runner.session.root, get_entry(runner.session, path)?)?;
            let current = runner.text(&["hash-object", "--no-filters", "--", &relative])?;
            if !hash(&current) {
                return Err("Invalid working-copy object id".into());
            }
            repository::ensure_revision(&runner.session.root, get_entry(runner.session, path)?)?;
            if current == fields[1] {
                "equal".into()
            } else {
                "different".into()
            }
        }
    })
}

fn staged_status(
    runner: &Runner<'_>,
    head: Option<&str>,
    literal: &str,
    tracked: bool,
) -> Result<bool, String> {
    Ok(if let Some(head) = head {
        !runner
            .run(
                &[
                    "diff",
                    "--cached",
                    "--raw",
                    "-z",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--no-renames",
                    "--ignore-submodules=all",
                    head,
                    "--",
                    &literal,
                ],
                32 * 1024,
            )?
            .1
            .is_empty()
    } else {
        tracked
    })
}

fn query(
    app: &tauri::AppHandle,
    state: &Backend,
    session: &Session,
    query_id: String,
    path: &str,
    days: u64,
    cancelled: &AtomicBool,
    force: bool,
) -> Result<ResultData, String> {
    let mut result = ResultData {
        snapshot_id: session.id.clone(),
        query_id,
        status: "not-repository",
        context: None,
        history: None,
        cached: false,
        warnings: Vec::new(),
    };
    repository::ensure_revision(&session.root, get_entry(session, path)?)?;
    let absolute = session.root.join(path);
    let Some(root) = candidate_root(absolute.parent().ok_or("Invalid Git file path")?) else {
        return Ok(result);
    };
    let Some(executable) = git_executable(&root) else {
        result.status = "missing-git";
        return Ok(result);
    };
    let runner = Runner {
        executable,
        root,
        session,
        cancelled,
        started: Instant::now(),
    };
    let root = PathBuf::from(runner.text(&["rev-parse", "--show-toplevel"])?)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !absolute.starts_with(&root) || root != runner.root {
        return Err("Git worktree does not contain the selected file".into());
    }
    let relative = absolute
        .strip_prefix(&root)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let literal = format!(":(top,literal){relative}");
    let git_dir = runner.text(&["rev-parse", "--absolute-git-dir"])?;
    let common_dir = runner.text(&["rev-parse", "--path-format=absolute", "--git-common-dir"])?;
    let branch = runner.run(&["symbolic-ref", "-q", "--short", "HEAD"], 4096)?;
    let branch = if branch.0 {
        Some(
            String::from_utf8(branch.1)
                .map_err(|_| "Non-UTF-8 branch")?
                .trim_end()
                .into(),
        )
    } else {
        None
    };
    let head = runner.run(&["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], 256)?;
    let head = if head.0 {
        Some(
            String::from_utf8(head.1)
                .map_err(|_| "Invalid HEAD")?
                .trim()
                .to_string(),
        )
    } else {
        None
    };
    if head.as_ref().is_some_and(|h| !hash(h)) {
        return Err("Invalid HEAD object id".into());
    }
    let shallow = runner.text(&["rev-parse", "--is-shallow-repository"])? == "true";
    let tracked = runner
        .run(&["ls-files", "--error-unmatch", "--", &literal], 32 * 1024)?
        .0;
    let staged_change = staged_status(&runner, head.as_deref(), &literal, tracked)?;
    // Raw-byte comparison deliberately bypasses clean/process filters and EOL conversion.
    // It is not porcelain status: a CRLF checkout may differ from an LF index blob.
    let working_copy = working_copy_status(&runner, path, &relative, &literal, tracked)?;
    let linked_worktree =
        Path::new(&git_dir).canonicalize().ok() != Path::new(&common_dir).canonicalize().ok();
    let identity = match crate::storage::associate_git(
        app,
        session,
        &root,
        Path::new(&git_dir),
        Path::new(&common_dir),
    ) {
        Ok(value) => Some(value),
        Err(error) => {
            result.warnings.push(error);
            None
        }
    };
    let boundary = shallow_signature(&common_dir)?;
    result.context = Some(Context {
        root: root.to_string_lossy().into_owned(),
        git_dir,
        common_dir,
        branch,
        head: head.clone(),
        shallow,
        linked_worktree,
        tracked_in_index: tracked,
        staged_change,
        working_copy,
        identity,
    });
    let Some(head) = head else {
        result.status = "unborn";
        return Ok(result);
    };
    // Cache is reused within a five-minute bucket only for the same immutable HEAD.
    let until = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs()
        / 300
        * 300;
    let since = until.saturating_sub(days * 86400);
    let key = serde_json::to_string(&(
        ALGORITHM,
        &root,
        &result.context.as_ref().map(|c| &c.git_dir),
        &boundary,
        &head,
        days,
        since,
        until,
        &relative,
    ))
    .map_err(|e| e.to_string())?;
    let mut cached = if force {
        None
    } else {
        let cache = state.git.cache.lock().map_err(|e| e.to_string())?;
        cache
            .iter()
            .find(|(k, _, _)| k == &key)
            .map(|(_, history, _)| history.clone())
    };
    if cached.is_none() && !force {
        match crate::storage::read_git_cache(app, &key) {
            Ok(Some(payload)) => match serde_json::from_str::<History>(&payload) {
                Ok(history) if history.since == since && history.until == until => {
                    cached = Some(history)
                }
                _ => result.warnings.push("Invalid Git cache ignored".into()),
            },
            Ok(None) => {}
            Err(error) => result.warnings.push(error),
        }
    }
    if let Some(history) = cached {
        result.history = Some(history);
        result.cached = true;
    } else {
        let since_arg = format!("--since-as-filter=@{since}");
        let until_arg = format!("--until=@{until}");
        let count = format!("--max-count={}", MAX_COMMITS + 1);
        let (_, bytes) = runner.run(
            &[
                "log",
                "--root",
                "--no-decorate",
                "--format=%x1e%H%x00%ct%x00",
                "--numstat",
                "-z",
                "--no-merges",
                "--follow",
                "--find-renames=50%",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                "--no-notes",
                "--no-show-signature",
                "--diff-algorithm=myers",
                &since_arg,
                &until_arg,
                &count,
                &head,
                "--",
                &literal,
            ],
            MAX_OUTPUT,
        )?;
        let history = parse_history(&bytes, since, until)?;
        let bytes = serde_json::to_vec(&history)
            .map_err(|e| e.to_string())?
            .len();
        let mut cache = state.git.cache.lock().map_err(|e| e.to_string())?;
        runner.check()?;
        while cache.len() >= 16
            || cache.iter().map(|(_, _, size)| size).sum::<usize>() + bytes > MAX_OUTPUT
        {
            if cache.pop_front().is_none() {
                break;
            }
        }
        cache.push_back((key.clone(), history.clone(), bytes));
        result.history = Some(history);
    }
    let final_head = runner.text(&["rev-parse", "--verify", "HEAD^{commit}"])?;
    if final_head != head {
        return Err("HEAD changed during the query. Refresh Git history.".into());
    }
    if shallow_signature(
        &result
            .context
            .as_ref()
            .ok_or("Missing Git context")?
            .common_dir,
    )? != boundary
    {
        return Err("Git shallow boundary changed; refresh history".into());
    }
    repository::ensure_revision(&session.root, get_entry(session, path)?)?;
    runner.check()?;
    if !result.cached {
        let payload = serde_json::to_string(&result.history).map_err(|e| e.to_string())?;
        if let Err(error) = crate::storage::write_git_cache(app, &key, &payload) {
            result.warnings.push(error);
        }
    }
    result.status = "ready";
    Ok(result)
}

#[tauri::command]
pub async fn git_file_history(
    app: tauri::AppHandle,
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    query_id: String,
    path: String,
    days: u64,
    force: bool,
) -> Result<ResultData, String> {
    if ![7, 30, 90, 365].contains(&days) || query_id.is_empty() || query_id.len() > 128 {
        return Err("Invalid Git query".into());
    }
    let session = get_session(&state, &snapshot_id)?;
    get_entry(&session, &path)?;
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
        check_session(&session)?;
        if cancelled.load(Ordering::SeqCst) {
            return Err("Git query cancelled".into());
        }
        let result = query(
            &app, &state, &session, query_id, &path, days, &cancelled, force,
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
#[tauri::command]
pub fn cancel_git(state: State<'_, Arc<Backend>>, query_id: String) -> Result<(), String> {
    let active = state.git.active.lock().map_err(|e| e.to_string())?;
    if let Some(job) = active.as_ref().filter(|job| job.id == query_id) {
        job.cancelled.store(true, Ordering::SeqCst);
    }
    Ok(())
}
