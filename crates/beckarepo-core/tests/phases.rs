use beckarepo_core::{analyze, policy, repository as repo, AnalysisRequest, RepositoryFile};
use std::{
    collections::BTreeSet,
    fs,
    path::PathBuf,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

fn folder(label: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "beckarepo-validation-{label}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&path).unwrap();
    path
}
fn put(root: &std::path::Path, path: &str, text: impl AsRef<[u8]>) {
    let path = root.join(path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
fn request(files: &[(&str, &str)]) -> AnalysisRequest {
    AnalysisRequest {
        schema_version: 1,
        files: files
            .iter()
            .map(|(path, text)| RepositoryFile {
                path: (*path).into(),
                name: path.rsplit('/').next().unwrap().into(),
                size: text.len() as u64,
                content: Some((*text).into()),
            })
            .collect(),
    }
}
fn edges(files: &[(&str, &str)]) -> BTreeSet<(String, String, String)> {
    analyze(&request(files))
        .unwrap()
        .edges
        .into_iter()
        .filter(|e| ["import", "require", "re-export"].contains(&e.kind.as_str()))
        .map(|e| (e.source, e.target, e.kind))
        .collect()
}
fn has(edges: &BTreeSet<(String, String, String)>, from: &str, to: &str) -> bool {
    edges.iter().any(|(a, b, _)| a == from && b == to)
}

#[test]
fn f0_sensitive_names_and_directory_policy() {
    for name in [
        ".ENV",
        "a/.env.example",
        "keys/id_rsa.pub",
        "a\\.aws\\config",
        "token.pem",
        "service-account.json",
    ] {
        assert!(policy::is_sensitive_path(name), "{name}");
    }
    assert!(!policy::should_skip_directory_at("project/src/bin"));
    assert!(policy::should_skip_directory_at("project/bin"));
    assert!(policy::classify("src/main.rs").is_some());
}
#[test]
fn f0_request_boundaries() {
    for name in [
        "../x.rs",
        "a/../x.rs",
        "/x.rs",
        "C:/x.rs",
        "a\\x.rs",
        "a//x.rs",
        ".env",
    ] {
        assert!(request(&[(name, "x")]).validate().is_err(), "{name}");
    }
    let text = "x".repeat(policy::MAX_CONTENT_BYTES as usize);
    assert!(request(&[("x.rs", &text)]).validate().is_err());
}
#[test]
fn f0_filesystem_confinement_and_symlink() {
    let root = folder("confinement");
    let outside = folder("outside");
    put(&root, "ok.txt", "ok");
    put(&outside, "outside.txt", "outside");
    let canonical = repo::canonical_root(&root).unwrap();
    for path in ["../outside.txt", "C:/Windows/win.ini", "a/../../x", ".env"] {
        assert!(repo::confined_path(&canonical, path).is_err());
    }
    #[cfg(windows)]
    {
        let link =
            std::os::windows::fs::symlink_file(outside.join("outside.txt"), root.join("link.txt"));
        if link.is_ok() {
            assert!(repo::confined_path(&canonical, "link.txt").is_err());
        } else {
            let command = format!(
                "New-Item -ItemType Junction -Path '{}' -Target '{}' | Out-Null",
                root.join("junction")
                    .display()
                    .to_string()
                    .replace('\'', "''"),
                outside.display().to_string().replace('\'', "''")
            );
            assert!(std::process::Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-Command", &command])
                .status()
                .unwrap()
                .success());
            assert!(repo::confined_path(&canonical, "junction/outside.txt").is_err());
            println!("F0: file symlink unavailable (Windows privilege); directory junction escape checked instead");
        }
    }
}
#[test]
fn f1_snapshot_preview_limits_and_unicode() {
    let root = folder("preview");
    put(&root, "small.txt", "needle conteúdo");
    put(&root, ".env", "SECRET_SENTINEL");
    put(
        &root,
        "exact.txt",
        vec![b'x'; policy::MAX_CONTENT_BYTES as usize],
    );
    put(&root, "invalid.txt", [0xff, 0xfe]);
    put(&root, "src/bin/main.rs", "fn main() {}");
    put(&root, "bin/ignored.rs", "ignored");
    let s = repo::scan(&root, |_| Ok(())).unwrap();
    assert!(!s
        .files
        .iter()
        .any(|f| f.path == ".env" || f.path == "bin/ignored.rs"));
    assert!(s.files.iter().any(|f| f.path == "src/bin/main.rs"));
    let json = serde_json::to_string(&s).unwrap();
    assert!(!json.contains("needle conteúdo") && !json.contains("SECRET_SENTINEL"));
    let canonical = repo::canonical_root(&root).unwrap();
    let small = s.files.iter().find(|f| f.path == "small.txt").unwrap();
    assert_eq!(
        repo::read_text(&canonical, small)
            .unwrap()
            .content
            .as_deref(),
        Some("needle conteúdo")
    );
    let exact = s.files.iter().find(|f| f.path == "exact.txt").unwrap();
    assert_eq!(
        repo::read_text(&canonical, exact).unwrap().status,
        "too-large"
    );
    let invalid = s.files.iter().find(|f| f.path == "invalid.txt").unwrap();
    assert!(repo::read_text(&canonical, invalid)
        .unwrap()
        .content
        .unwrap()
        .contains('\u{fffd}'));
    put(&root, "small.txt", "changed length");
    assert_eq!(
        repo::read_text(&canonical, small).unwrap().status,
        "changed"
    );
}
#[test]
fn f1_incremental_reuse_and_config_invalidation() {
    let root = folder("incremental");
    put(
        &root,
        "tsconfig.json",
        r#"{"compilerOptions":{"paths":{"@x":["./a.ts"]}}}"#,
    );
    put(&root, "main.ts", "import '@x';");
    put(&root, "a.ts", "export const a=1;");
    put(&root, "b.ts", "export const b=2;");
    let (_, cache) = repo::scan_incremental(&root, None, |_| Ok(())).unwrap();
    let (second, cache) = repo::scan_incremental(&root, Some(&cache), |_| Ok(())).unwrap();
    assert_eq!(second.changes.parsed, 0);
    assert_eq!(second.changes.reused, 4);
    put(
        &root,
        "tsconfig.json",
        r#"{"compilerOptions":{"paths":{"@x":["./b.ts"]}},"more":true}"#,
    );
    let (third, _) = repo::scan_incremental(&root, Some(&cache), |_| Ok(())).unwrap();
    assert!(third
        .graph
        .edges
        .iter()
        .any(|e| e.source == "main.ts" && e.target == "b.ts"));
    assert_eq!(third.changes.reused, 0);
}
#[test]
fn f1_cancelled_scan_and_live_change_retry() {
    let root = folder("cancel");
    put(&root, "a.js", "let a=1;");
    assert!(repo::scan(&root, |_| Err("cancelled by validation".into()))
        .err()
        .unwrap()
        .contains("cancelled"));
    let mut changed = false;
    let mut retries = 0;
    let snapshot = repo::scan(&root, |progress| {
        if progress.phase == "reconcile" && !changed {
            put(&root, "a.js", "let a=123456789;");
            changed = true;
        }
        if progress.phase == "retry" {
            retries += 1;
        }
        Ok(())
    })
    .unwrap();
    assert_eq!(retries, 1);
    assert_eq!(snapshot.files[0].size, 16);
    let mut changes = 0;
    let result = repo::scan(&root, |progress| {
        if progress.phase == "reconcile" {
            changes += 1;
            put(&root, "a.js", "x".repeat(100 + changes));
        }
        Ok(())
    });
    assert!(result.is_err());
    assert_eq!(changes, 3);
}
#[test]
fn f1_search_pagination_cancellation_and_asset() {
    let root = folder("search");
    for i in 0..7 {
        put(&root, &format!("file{i}.txt"), "needle here\nother line");
    }
    put(&root, "tiny.png", [137, 80, 78, 71, 13, 10, 26, 10]);
    let snapshot = repo::scan(&root, |_| Ok(())).unwrap();
    let root = repo::canonical_root(&root).unwrap();
    let mut cursor = 0;
    let mut seen = BTreeSet::new();
    loop {
        let page = repo::search(&root, &snapshot.files, "needle", cursor, 2, || Ok(())).unwrap();
        for hit in page.hits {
            assert!(seen.insert(hit.path));
        }
        if let Some(next) = page.next_cursor {
            assert!(next > cursor);
            cursor = next;
        } else {
            break;
        }
    }
    assert_eq!(seen.len(), 7);
    assert!(repo::search(&root, &snapshot.files, "needle", 0, 2, || Err(
        "cancel".into()
    ))
    .is_err());
    assert_eq!(repo::read_asset(&root, "tiny.png").unwrap().len(), 8);
    assert!(repo::read_asset(&root, "file0.txt").is_err());
}
#[test]
fn f5_web_corpus_exact_edges() {
    let files=[("tsconfig.json",r#"{"extends":"./base.json","compilerOptions":{"paths":{"@lib/*":["lib/*"]}}}"#),("base.json","{ // JSONC\n\"compilerOptions\":{\"baseUrl\":\".\",},}"),("main.ts","// import './fake';\nimport {x as y} from '@lib/a.js'; export {x} from './lib/a.js'; const z = require('./lib/a'); import('./lib/a');"),("lib/a.ts","export const x=1;"),("fake.ts","")];
    let result = analyze(&request(&files)).unwrap();
    let actual = edges(&files);
    let expected: BTreeSet<_> = ["import", "re-export", "require"]
        .into_iter()
        .map(|k| ("main.ts".into(), "lib/a.ts".into(), k.into()))
        .collect();
    assert_eq!(actual, expected);
    for edge in result
        .edges
        .into_iter()
        .filter(|e| ["import", "require", "re-export"].contains(&e.kind.as_str()))
    {
        let ev = edge.evidence.unwrap();
        assert!(ev.end_byte > ev.start_byte);
        assert!(ev.resolution.is_some());
    }
    println!("F5 web corpus: TP=3 FP=0 FN=0; precision=1 recall=1 (bounded synthetic corpus)");
}
#[test]
fn f5_config_cycles_dynamic_import_and_syntax_errors_are_visible() {
    let result = analyze(&request(&[
        ("tsconfig.json", r#"{"extends":"./base.json"}"#),
        ("base.json", r#"{"extends":"./tsconfig.json"}"#),
        (
            "main.ts",
            "import(dynamicName); const = ; import '@unknown';",
        ),
    ]))
    .unwrap();
    let node = result.nodes.iter().find(|n| n.path == "main.ts").unwrap();
    assert!(!node.parsing.diagnostics.is_empty());
    assert!(!result.edges.iter().any(|e| e.source == "main.ts"));
}
#[test]
fn f5_cargo_targets_inline_and_own_library() {
    let files=[("Cargo.toml","[package]\nname='demo'\nedition='2021'\n[lib]\npath='engine/root.rs'\n[[bin]]\nname='cli'\npath='tool/entry.rs'"),("engine/root.rs","mod util; mod inline { pub struct X; }"),("engine/util.rs","use crate::inline::X; use super::inline::X;"),("tool/entry.rs","use demo::inline::X; mod helper;"),("tool/helper.rs","use crate::main; ")];
    let result = edges(&files);
    assert!(has(&result, "engine/root.rs", "engine/util.rs"));
    assert!(has(&result, "engine/util.rs", "engine/root.rs"));
    assert!(has(&result, "tool/entry.rs", "engine/root.rs"));
    assert!(has(&result, "tool/entry.rs", "tool/helper.rs"));
    assert!(has(&result, "tool/helper.rs", "tool/entry.rs"));
    assert_eq!(result.len(), 5);
    println!("F5 Cargo target corpus: TP=5 FP=0 FN=0; precision=1 recall=1");
}
#[test]
fn f5_cargo_workspace_renamed_dependency() {
    let files=[("Cargo.toml","[workspace]\nmembers=['app','lib']\n[workspace.package]\nedition='2021'\n[workspace.dependencies]\nalias={package='actual',path='lib'}"),("app/Cargo.toml","[package]\nname='app'\nedition.workspace=true\n[dependencies]\nalias.workspace=true"),("app/src/main.rs","use alias::Thing;"),("lib/Cargo.toml","[package]\nname='actual'\nedition='2021'"),("lib/src/lib.rs","pub struct Thing;")];
    let result = edges(&files);
    assert!(has(&result, "app/src/main.rs", "lib/src/lib.rs"));
    assert_eq!(result.len(), 1);
}
#[test]
fn f5_shared_source_disagreement_and_missing_module() {
    let result = analyze(&request(&[
        ("Cargo.toml", "[package]\nname='demo'\nedition='2021'"),
        ("src/lib.rs", "mod shared;"),
        ("src/main.rs", "mod shared;"),
        ("src/shared.rs", "use crate::Thing;"),
    ]))
    .unwrap();
    let shared = result
        .nodes
        .iter()
        .find(|n| n.path == "src/shared.rs")
        .unwrap();
    assert_eq!(shared.parsing.targets.len(), 2);
    assert!(shared
        .parsing
        .diagnostics
        .iter()
        .any(|d| d.contains("different files")));
    assert!(!result.edges.iter().any(|e| e.source == "src/shared.rs"));
}
#[test]
fn f5_ambiguous_module_and_optional_dependency() {
    let result=analyze(&request(&[("Cargo.toml","[package]\nname='demo'\nedition='2021'\n[dependencies]\ndep={path='dep',optional=true}"),("src/lib.rs","mod a; use dep::X;"),("src/a.rs",""),("src/a/mod.rs",""),("dep/Cargo.toml","[package]\nname='dep'\nedition='2021'"),("dep/src/lib.rs","")])).unwrap();
    assert!(result.edges.is_empty());
    let main = result
        .nodes
        .iter()
        .find(|n| n.path == "src/lib.rs")
        .unwrap();
    assert!(main.parsing.diagnostics.len() >= 2);
}
#[test]
fn f5_comments_and_raw_identifiers() {
    let result = edges(&[
        ("Cargo.toml", "[package]\nname='demo'\nedition='2021'"),
        (
            "src/lib.rs",
            "// mod fake;\nmod r#type; use crate::r#type::Thing;",
        ),
        ("src/type.rs", "pub struct Thing;"),
        ("src/fake.rs", ""),
    ]);
    assert_eq!(result.len(), 1);
    assert!(has(&result, "src/lib.rs", "src/type.rs"));
}
#[test]
fn f0_f1_scaling_metadata_is_not_source_volume() {
    let root = folder("scale");
    let source = format!("// {}", "plain text ".repeat(4000));
    for i in 0..1000 {
        put(&root, &format!("src/f{i}.js"), &source);
    }
    let start = Instant::now();
    let (snapshot, cache) = repo::scan_incremental(&root, None, |_| Ok(())).unwrap();
    let elapsed = start.elapsed();
    let bytes = serde_json::to_vec(&snapshot).unwrap().len();
    assert!(bytes < 2_000_000);
    assert_eq!(snapshot.files.len(), 1000);
    let start = Instant::now();
    let (next, _) = repo::scan_incremental(&root, Some(&cache), |_| Ok(())).unwrap();
    assert_eq!(next.changes.reused, 1000);
    println!(
        "F1 scale: source_bytes={} snapshot_bytes={} first_ms={} incremental_ms={} temp={}",
        source.len() * 1000,
        bytes,
        elapsed.as_millis(),
        start.elapsed().as_millis(),
        root.display()
    );
}
