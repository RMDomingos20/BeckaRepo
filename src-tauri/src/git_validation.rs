use super::*;
pub(super) fn command(root: &Path, args: &[&str]) -> Vec<u8> {
    let result = Command::new(git_executable(root).unwrap())
        .current_dir(root)
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .args(["-c", "core.hooksPath=", "-c", "commit.gpgsign=false"])
        .args(args)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "git {:?}: {}",
        args,
        String::from_utf8_lossy(&result.stderr)
    );
    result.stdout
}
pub(super) fn fixture() -> PathBuf {
    let root = crate::validation_support::folder("git");
    command(&root, &["init", "-b", "validation"]);
    command(&root, &["config", "user.name", "Validation"]);
    command(
        &root,
        &["config", "user.email", "validation@example.invalid"],
    );
    command(&root, &["config", "core.autocrlf", "false"]);
    std::fs::write(root.join("a.js"), "a\n").unwrap();
    std::fs::write(root.join("b.js"), "b\n").unwrap();
    command(&root, &["add", "."]);
    command(&root, &["commit", "-m", "initial"]);
    std::fs::write(root.join("a.js"), "a\nsecond\n").unwrap();
    std::fs::write(root.join("b.js"), "b\nsecond\n").unwrap();
    command(&root, &["add", "."]);
    command(&root, &["commit", "-m", "paired"]);
    root
}
#[test]
fn f3_real_history_churn_rename_and_literal_path() {
    let root = fixture();
    command(&root, &["mv", "a.js", "renamed [x].js"]);
    command(&root, &["commit", "-m", "rename"]);
    let session = crate::validation_support::session(&root);
    let flag = AtomicBool::new(false);
    let runner = Runner {
        executable: git_executable(&root).unwrap(),
        root: session.root.clone(),
        session: &session,
        cancelled: &flag,
        started: Instant::now(),
    };
    let (ok, bytes) = runner
        .run(
            &[
                "log",
                "--follow",
                "--numstat",
                "-z",
                "--format=%x1e%H%x00%ct%x00",
                "--no-ext-diff",
                "--no-textconv",
                "--",
                "renamed [x].js",
            ],
            MAX_OUTPUT,
        )
        .unwrap();
    assert!(ok);
    let history = parse_history(&bytes, 0, u64::MAX).unwrap();
    assert_eq!(history.frequency, 3);
    assert_eq!(history.churn, 2);
    assert_eq!(history.renames, 1);
    let head = runner.text(&["rev-parse", "HEAD"]).unwrap();
    assert!(hash(&head));
    assert!(runner.run(&["log", "--oneline"], 1).is_err());
    flag.store(true, Ordering::SeqCst);
    assert!(runner.run(&["status"], 4096).is_err());
}
#[test]
fn f3_worktree_shallow_clone_and_non_git() {
    let root = fixture();
    let work = root.parent().unwrap().join(format!(
        "{}-worktree",
        root.file_name().unwrap().to_string_lossy()
    ));
    command(
        &root,
        &["worktree", "add", "-b", "secondary", work.to_str().unwrap()],
    );
    assert!(work.join(".git").is_file());
    let session = crate::validation_support::session(&work);
    let flag = AtomicBool::new(false);
    let runner = Runner {
        executable: git_executable(&work).unwrap(),
        root: session.root.clone(),
        session: &session,
        cancelled: &flag,
        started: Instant::now(),
    };
    assert_ne!(
        runner.text(&["rev-parse", "--absolute-git-dir"]).unwrap(),
        runner
            .text(&["rev-parse", "--path-format=absolute", "--git-common-dir"])
            .unwrap()
    );
    let clone = root.parent().unwrap().join(format!(
        "{}-shallow",
        root.file_name().unwrap().to_string_lossy()
    ));
    let url = format!("file:///{}", root.to_string_lossy().replace('\\', "/"));
    command(
        &root,
        &["clone", "--depth", "1", &url, clone.to_str().unwrap()],
    );
    assert_eq!(
        String::from_utf8(command(&clone, &["rev-parse", "--is-shallow-repository"]))
            .unwrap()
            .trim(),
        "true"
    );
    let plain = crate::validation_support::folder("notgit");
    assert!(candidate_root(&plain).is_none());
}
#[test]
fn f3_malformed_binary_sensitive_records_and_cache_invalidation() {
    assert!(parse_history(b"invalid", 0, 100).is_err());
    assert!(parse_history(&[255], 0, 100).is_err());
    let bytes = format!(
        "\u{1e}{}\0{}\0-\t-\timage.png\0\u{1e}{}\0{}\x001\t0\t.env\0",
        "a".repeat(40),
        20,
        "b".repeat(40),
        10
    );
    let history = parse_history(bytes.as_bytes(), 0, 100).unwrap();
    assert_eq!(history.binary_commits, 1);
    assert_eq!(history.excluded_records, 1);
    let state = GitState::default();
    let cancelled = Arc::new(AtomicBool::new(false));
    *state.active.lock().unwrap() = Some(Job {
        id: "query".into(),
        cancelled: cancelled.clone(),
    });
    state.invalidate();
    assert!(cancelled.load(Ordering::SeqCst));
    assert!(state.cache.lock().unwrap().is_empty());
}

fn local_status(root: &Path, path: &str) -> (bool, String) {
    let session = crate::validation_support::session(root);
    let cancelled = AtomicBool::new(false);
    let runner = Runner {
        executable: git_executable(root).unwrap(),
        root: session.root.clone(),
        session: &session,
        cancelled: &cancelled,
        started: Instant::now(),
    };
    let literal = format!(":(top,literal){path}");
    let tracked = runner
        .run(&["ls-files", "--error-unmatch", "--", &literal], 32768)
        .unwrap()
        .0;
    let (exists, head) = runner
        .run(&["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], 256)
        .unwrap();
    let head = String::from_utf8(head).unwrap();
    (
        staged_status(&runner, exists.then_some(head.trim()), &literal, tracked).unwrap(),
        working_copy_status(&runner, path, path, &literal, tracked).unwrap(),
    )
}

#[test]
fn f3_local_staged_untracked_eol_and_filters_are_separate() {
    let root = fixture();
    assert_eq!(local_status(&root, "a.js"), (false, "equal".into()));
    std::fs::write(root.join("a.js"), "a\r\nsecond\r\n").unwrap();
    assert_eq!(local_status(&root, "a.js"), (false, "different".into()));
    std::fs::write(root.join("a.js"), "changed\n").unwrap();
    command(&root, &["add", "a.js"]);
    assert_eq!(local_status(&root, "a.js"), (true, "equal".into()));
    std::fs::write(root.join("a.js"), "after staging\n").unwrap();
    assert_eq!(local_status(&root, "a.js"), (true, "different".into()));
    std::fs::write(root.join("untracked [x].js"), "new\n").unwrap();
    assert_eq!(
        local_status(&root, "untracked [x].js"),
        (false, "untracked".into())
    );
    // A required unavailable filter would fail if the production comparison invoked it.
    std::fs::write(root.join(".gitattributes"), "*.js filter=validation\n").unwrap();
    command(&root, &["config", "filter.validation.required", "true"]);
    command(
        &root,
        &[
            "config",
            "filter.validation.clean",
            "beckarepo-validation-command-does-not-exist",
        ],
    );
    assert_eq!(local_status(&root, "a.js"), (true, "different".into()));
}
