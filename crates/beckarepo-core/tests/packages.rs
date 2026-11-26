use beckarepo_core::{analyze, repository, AnalysisRequest, AnalysisResult, RepositoryFile};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
fn run(files: &[(&str, &str)]) -> AnalysisResult {
    let result = analyze(&AnalysisRequest {
        schema_version: 1,
        files: files
            .iter()
            .map(|(p, s)| RepositoryFile {
                path: (*p).into(),
                name: p.rsplit('/').next().unwrap().into(),
                size: s.len() as u64,
                content: Some((*s).into()),
            })
            .collect(),
    })
    .unwrap();
    result.validate().unwrap();
    result
}
fn folder() -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "beckarepo-f6-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&path).unwrap();
    path
}
fn put(root: &std::path::Path, path: &str, text: &str) {
    let path = root.join(path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
#[test]
fn npm_declarations_alias_subpaths_and_lock_transitivity_are_distinct() {
    let result=run(&[
        ("package.json",r#"{"dependencies":{"alias":"npm:real@^1","unused":"^2","@scope/lib":"^3"},"devDependencies":{"tool":"^1"}}"#),
        ("src/main.ts","import {x} from 'alias/sub'; import '@scope/lib/extra'; // import 'unused';\nconst s = \"import 'unused'\";"),
        ("package-lock.json",r#"{"lockfileVersion":3,"packages":{"":{"dependencies":{"alias":"npm:real@^1","unused":"^2","@scope/lib":"^3"},"devDependencies":{"tool":"^1"}},"node_modules/alias":{"name":"real","version":"1.2.0","dependencies":{"child":"^4"}},"node_modules/unused":{"version":"2.0.0"},"node_modules/@scope/lib":{"version":"3.0.0"},"node_modules/tool":{"version":"1.0.0"},"node_modules/child":{"version":"4.0.0"}}}"#),
    ]);
    assert_eq!(result.stats.files, 2);
    assert!(!result.nodes.iter().any(|n| n.path.contains("lock")));
    let p = &result.packages;
    assert_eq!(p.nodes.iter().filter(|n| n.state == "declared").count(), 4);
    assert_eq!(
        p.edges
            .iter()
            .filter(|e| e.kind == "imports-package")
            .count(),
        2
    );
    assert_eq!(p.edges.iter().filter(|e| e.kind == "declares").count(), 4);
    assert_eq!(
        p.edges.iter().filter(|e| e.kind == "resolves-to").count(),
        4
    );
    assert_eq!(
        p.edges
            .iter()
            .filter(|e| e.kind == "lock-dependency")
            .count(),
        1
    );
    let alias = p
        .nodes
        .iter()
        .find(|n| n.state == "declared" && n.alias == "alias")
        .unwrap();
    assert_eq!(alias.name, "real");
    assert_eq!(alias.resolved_version.as_deref(), Some("1.2.0"));
    let e = p
        .edges
        .iter()
        .find(|e| e.kind == "imports-package" && e.target == alias.id)
        .unwrap();
    assert_eq!(e.evidence.as_ref().unwrap().line, 1);
}
#[test]
fn npm_local_alias_has_priority_and_stale_lock_does_not_resolve() {
    let r = run(&[
        ("package.json", r#"{"dependencies":{"lib":"^2"}}"#),
        (
            "tsconfig.json",
            r#"{"compilerOptions":{"paths":{"lib":["./local.ts"]}}}"#,
        ),
        ("main.ts", "import 'lib';"),
        ("local.ts", ""),
        (
            "package-lock.json",
            r#"{"lockfileVersion":3,"packages":{"":{"dependencies":{"lib":"^1"}},"node_modules/lib":{"version":"1.0.0"}}}"#,
        ),
    ]);
    assert!(r.edges.iter().any(|e| e.target == "local.ts"));
    assert!(!r
        .packages
        .edges
        .iter()
        .any(|e| e.kind == "imports-package" || e.kind == "resolves-to"));
    assert!(r.packages.diagnostics.iter().any(|s| s.contains("differs")));
}
#[test]
fn npm_workspaces_scanner_and_lock_only_changes_are_reflected() {
    let root = folder();
    for (p, s) in [
        (
            "package.json",
            r#"{"workspaces":["packages/*"],"dependencies":{"local":"workspace:*","dep":"^1"}}"#,
        ),
        (
            "packages/local/package.json",
            r#"{"name":"local","version":"1.0.0"}"#,
        ),
        ("main.ts", "import 'dep'; import 'local';"),
        (
            "package-lock.json",
            r#"{"lockfileVersion":3,"packages":{"":{"dependencies":{"local":"workspace:*","dep":"^1"}},"node_modules/dep":{"version":"1.0.0"},"node_modules/local":{"link":true,"resolved":"packages/local"}}}"#,
        ),
    ] {
        put(&root, p, s);
    }
    let (first, cache) = repository::scan_incremental(&root, None, |_| Ok(())).unwrap();
    let local = first
        .graph
        .packages
        .nodes
        .iter()
        .find(|n| n.state == "declared" && n.name == "local")
        .unwrap();
    assert_eq!(
        local.workspace.as_deref(),
        Some("packages/local/package.json")
    );
    assert!(!first.files.iter().any(|f| f.name == "package-lock.json"));
    let old = fs::read_to_string(root.join("package-lock.json")).unwrap();
    put(&root, "package-lock.json", &old.replace("1.0.0", "1.10.0"));
    let (next, _) = repository::scan_incremental(&root, Some(&cache), |_| Ok(())).unwrap();
    assert!(next
        .graph
        .packages
        .nodes
        .iter()
        .any(|n| n.state == "declared"
            && n.name == "dep"
            && n.resolved_version.as_deref() == Some("1.10.0")));
    assert_eq!(next.changes.parsed, 0); // Package metadata is rebuilt even when file facts are reused.
}
#[test]
fn cargo_alias_workspace_categories_and_lock_versions() {
    let r=run(&[
        ("Cargo.toml","[workspace]\nmembers=['crates/*']\n[workspace.dependencies]\nrenamed={package='serde',version='1'}"),
        ("crates/app/Cargo.toml","[package]\nname='app'\nversion='0.1.0'\nedition='2021'\n[dependencies]\nrenamed.workspace=true\nlocal={path='../local'}\n[dev-dependencies]\ntestlib='2'\n[build-dependencies]\nbuilder='3'\n[target.'cfg(windows)'.dependencies]\nwindows='1'"),
        ("crates/local/Cargo.toml","[package]\nname='local'\nversion='0.1.0'\nedition='2021'"),("crates/local/src/lib.rs","pub struct L;"),
        ("crates/app/src/lib.rs","use renamed::Serialize; use local::L; use testlib::T;"),
        ("crates/app/tests/a.rs","use testlib::T;"),("crates/app/build.rs","use builder::B;"),
        ("Cargo.lock","version=4\n[[package]]\nname='serde'\nversion='1.0.2'\nsource='registry+https://github.com/rust-lang/crates.io-index'\ndependencies=['child 1.0.0']\n[[package]]\nname='child'\nversion='1.0.0'\nsource='registry+https://github.com/rust-lang/crates.io-index'"),
    ]);
    let p = &r.packages;
    let serde = p
        .nodes
        .iter()
        .find(|n| n.state == "declared" && n.alias == "renamed")
        .unwrap();
    assert_eq!(serde.name, "serde");
    assert_eq!(serde.resolved_version.as_deref(), Some("1.0.2"));
    assert!(p
        .nodes
        .iter()
        .any(|n| n.workspace.as_deref() == Some("crates/local/Cargo.toml")));
    assert_eq!(
        p.edges
            .iter()
            .filter(|e| e.kind == "imports-package")
            .count(),
        4
    );
    assert!(!p.edges.iter().any(|e| e.kind == "imports-package"
        && e.source == "crates/app/src/lib.rs"
        && p.nodes
            .iter()
            .any(|n| n.id == e.target && n.name == "testlib")));
    assert_eq!(
        p.edges
            .iter()
            .filter(|e| e.kind == "lock-dependency")
            .count(),
        1
    );
}
#[test]
fn cargo_ambiguous_versions_conditions_and_module_shadowing_are_not_guessed() {
    let r=run(&[("Cargo.toml","[package]\nname='x'\nedition='2021'\n[dependencies]\na='1'\nopt={version='1',optional=true}\n[target.'cfg(windows)'.dependencies]\nwin='1'"),("src/lib.rs","mod a; use a::T; use opt::T; use win::T;"),("src/a.rs","pub struct T;"),("Cargo.lock","version=4\n[[package]]\nname='a'\nversion='1.0.0'\nsource='registry+https://github.com/rust-lang/crates.io-index'\n[[package]]\nname='a'\nversion='1.1.0'\nsource='registry+https://github.com/rust-lang/crates.io-index'")]);
    assert!(!r
        .packages
        .edges
        .iter()
        .any(|e| e.kind == "imports-package" || e.kind == "resolves-to"));
    assert!(r.packages.diagnostics.iter().any(|d| d.contains("unique")));
}
#[test]
fn maven_direct_dependencies_exclude_management_and_do_not_invent_java_usage() {
    let r = run(&[
        (
            "pom.xml",
            r#"<project xmlns="http://maven.apache.org/POM/4.0.0"><dependencyManagement><dependencies><dependency><groupId>not</groupId><artifactId>used</artifactId></dependency></dependencies></dependencyManagement><dependencies><dependency><groupId>org.example</groupId><artifactId>core</artifactId><version>${core.version}</version><scope>test</scope></dependency></dependencies></project>"#,
        ),
        ("Main.java", "import org.example.core.Foo;"),
    ]);
    assert_eq!(r.packages.nodes.len(), 1);
    assert_eq!(r.packages.nodes[0].name, "org.example:core");
    assert_eq!(r.packages.nodes[0].category, "test");
    assert!(r.packages.nodes[0].resolved_version.is_none());
    assert_eq!(r.packages.edges.len(), 1);
}
#[test]
fn malformed_unsupported_and_entity_metadata_are_diagnostic() {
    let r = run(&[
        ("package.json", "{"),
        ("Cargo.lock", "version=999"),
        (
            "pom.xml",
            "<!DOCTYPE project [<!ENTITY secret SYSTEM 'file:///etc/passwd'>]><project/>",
        ),
        ("yarn.lock", "not parsed"),
    ]);
    assert!(r.packages.nodes.is_empty());
    assert_eq!(r.packages.diagnostics.len(), 4);
}
#[test]
fn metadata_limits_and_cancel_are_enforced() {
    let mut builder = beckarepo_core::packages::Builder::new();
    for i in 0..512 {
        builder
            .load(&format!("{i}/package.json"), Some("{}"))
            .unwrap();
    }
    assert!(builder.load("last/package.json", Some("{}")).is_err());
    let root = folder();
    put(&root, "Cargo.lock", "version=4");
    assert!(repository::scan(&root, |_| Err("cancelled".into()))
        .err()
        .unwrap()
        .contains("cancelled"));
}
