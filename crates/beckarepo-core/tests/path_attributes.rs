use beckarepo_core::{analyze, repository, AnalysisRequest, RepositoryFile};
use std::{
    collections::BTreeSet,
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

const MANIFEST: &str = "[package]\nname='paths'\nedition='2021'\n";
fn request(files: &[(&str, &str)]) -> AnalysisRequest {
    AnalysisRequest {
        schema_version: 1,
        files: files
            .iter()
            .map(|(path, source)| RepositoryFile {
                path: (*path).into(),
                name: path.rsplit('/').next().unwrap().into(),
                size: source.len() as u64,
                content: Some((*source).into()),
            })
            .collect(),
    }
}
fn root(label: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "beckarepo-path-{label}-{}-{}",
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
fn imports(result: &beckarepo_core::AnalysisResult) -> BTreeSet<(String, String)> {
    result
        .edges
        .iter()
        .filter(|e| e.kind == "import")
        .map(|e| (e.source.clone(), e.target.clone()))
        .collect()
}

#[test]
fn path_directories_match_rustc_for_roots_normal_mod_rs_and_inline_modules() {
    let files = [
        ("Cargo.toml", MANIFEST),
        ("src/lib.rs", r##"
#[path = "../shared/renamed.rs"] mod renamed;
mod plain; mod folder;
mod inline { #[path = "inner.rs"] mod child; }
#[path = "over"] mod redirected {
    mod leaf;
    #[path = "extra.rs"] mod explicit;
    mod deep { #[path = "chosen.rs"] mod choice; }
}
#[doc = "this mentions path but is not a path attribute"]
mod ordinary;
#[ /* attribute comment */ path = r#"sp ace/ação.rs"#]
// Comments must not detach the attribute from its module.
mod r#type;
const _: [(); 2] = [(); renamed::MARK];
const _: [(); 1] = [(); r#type::VALUE];
"##),
        ("shared/renamed.rs", "mod child; mod nested { pub mod leaf; } pub const MARK: usize = child::VALUE + nested::leaf::VALUE;"),
        ("shared/child.rs", "pub const VALUE: usize = 1;"),
        ("shared/nested/leaf.rs", "pub const VALUE: usize = 1;"),
        // This decoy detects incorrectly deriving children from the renamed file stem.
        ("shared/renamed/child.rs", "pub const VALUE: usize = 7;"),
        ("src/plain.rs", "#[path = \"beside.rs\"] mod sibling; mod inline { #[path = \"other.rs\"] mod child; } #[path = \"local\"] mod relocated { mod child; }"),
        ("src/beside.rs", ""),
        ("src/plain/inline/other.rs", ""),
        ("src/local/child.rs", ""),
        ("src/folder/mod.rs", "#[path=\"beside.rs\"] mod sibling; mod inline { #[path=\"value.rs\"] mod child; }"),
        ("src/folder/beside.rs", ""),
        ("src/folder/inline/value.rs", ""),
        ("src/inline/inner.rs", ""),
        ("src/over/leaf.rs", ""),
        ("src/over/extra.rs", ""),
        ("src/over/deep/chosen.rs", ""),
        ("src/ordinary.rs", ""),
        ("src/sp ace/ação.rs", "pub const VALUE: usize = 1;"),
    ];
    let result = analyze(&request(&files)).unwrap();
    let expected: BTreeSet<_> = [
        ("src/lib.rs", "shared/renamed.rs"),
        ("src/lib.rs", "src/plain.rs"),
        ("src/lib.rs", "src/folder/mod.rs"),
        ("src/lib.rs", "src/inline/inner.rs"),
        ("src/lib.rs", "src/over/leaf.rs"),
        ("src/lib.rs", "src/over/extra.rs"),
        ("src/lib.rs", "src/over/deep/chosen.rs"),
        ("src/lib.rs", "src/ordinary.rs"),
        ("src/lib.rs", "src/sp ace/ação.rs"),
        ("shared/renamed.rs", "shared/child.rs"),
        ("shared/renamed.rs", "shared/nested/leaf.rs"),
        ("src/plain.rs", "src/beside.rs"),
        ("src/plain.rs", "src/plain/inline/other.rs"),
        ("src/plain.rs", "src/local/child.rs"),
        ("src/folder/mod.rs", "src/folder/beside.rs"),
        ("src/folder/mod.rs", "src/folder/inline/value.rs"),
    ]
    .into_iter()
    .map(|(a, b)| (a.into(), b.into()))
    .collect();
    assert_eq!(imports(&result), expected);
    let edge = result
        .edges
        .iter()
        .find(|e| e.target == "src/sp ace/ação.rs")
        .unwrap();
    assert!(edge
        .evidence
        .as_ref()
        .unwrap()
        .resolution
        .as_ref()
        .unwrap()
        .contains("explicit #[path"));
    let disk = root("rustc-oracle");
    for (path, source) in files {
        put(&disk, path, source);
    }
    let output = Command::new("rustc")
        .args(["--edition=2021", "--crate-type=lib", "--emit=metadata"])
        .arg(disk.join("src/lib.rs"))
        .arg("--out-dir")
        .arg(&disk)
        .output()
        .expect("rustc available with Cargo");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    println!(
        "Rust path corpus: 16 expected import edges; rustc metadata compilation passed; {}",
        disk.display()
    );
}

#[test]
fn path_rejects_escape_absolute_missing_conflicts_conditions_and_recursion() {
    for declaration in [
        "#[path=\"../../escape.rs\"]",
        "#[path=\"/abs.rs\"]",
        "#[path=\"C:/abs.rs\"]",
        "#[path=\"missing.rs\"]",
        "#[path=\"leaf.rs\"] #[path=\"leaf.rs\"]",
        "#[cfg_attr(feature=\"chosen\", path=\"leaf.rs\")]",
        "#[path=concat!(\"leaf\",\".rs\")]",
        "#[path=\"\"]",
        "#[path=\"lib.rs\"]",
        "#[path=\"leaf\\u{2e}rs\"]",
    ] {
        let source = format!("{declaration} mod blocked; use crate::blocked::Thing;");
        let result = analyze(&request(&[
            ("Cargo.toml", MANIFEST),
            ("src/lib.rs", &source),
            ("src/blocked.rs", ""),
            ("src/leaf.rs", ""),
            ("escape.rs", ""),
        ]))
        .unwrap();
        assert!(imports(&result).is_empty(), "{declaration}");
        assert!(
            !result
                .nodes
                .iter()
                .find(|n| n.path == "src/lib.rs")
                .unwrap()
                .parsing
                .diagnostics
                .is_empty(),
            "{declaration}"
        );
    }
    let result = analyze(&request(&[
        ("Cargo.toml", MANIFEST),
        (
            "src/lib.rs",
            "#[path=\"../..\"] mod blocked { mod child; } use crate::blocked::child::Thing;",
        ),
        ("src/blocked/child.rs", ""),
    ]))
    .unwrap();
    assert!(imports(&result).is_empty());
}

#[test]
fn path_contexts_preserve_logical_modules_and_disagreement() {
    let files = [
        ("Cargo.toml", MANIFEST),
        (
            "src/lib.rs",
            "#[path=\"../shared.rs\"] mod shared; #[path=\"a.rs\"] mod target;",
        ),
        (
            "src/main.rs",
            "#[path=\"../shared.rs\"] mod shared; #[path=\"b.rs\"] mod target;",
        ),
        ("shared.rs", "use crate::target::Thing;"),
        ("src/a.rs", ""),
        ("src/b.rs", ""),
    ];
    let result = analyze(&request(&files)).unwrap();
    let shared = result.nodes.iter().find(|n| n.path == "shared.rs").unwrap();
    assert_eq!(shared.parsing.targets.len(), 2);
    assert!(shared.parsing.targets.iter().all(|t| t.module == "shared"));
    assert!(shared
        .parsing
        .diagnostics
        .iter()
        .any(|d| d.contains("different files")));
    assert!(!result.edges.iter().any(|e| e.source == "shared.rs"));
}

#[test]
fn path_duplicate_and_conditional_inline_modules_do_not_leak_descendants() {
    for source in [
        "mod x { mod child; } #[path=\"other\"] mod x { mod child; } use crate::x::child::Thing;",
        "#[cfg_attr(any(),path=\"other\")] mod x { mod child; } use crate::x::child::Thing;",
        "#![path=\"other\"] mod x; use crate::x::Thing;",
        "mod x { #![path=\"other\"] mod child; } use crate::x::child::Thing;",
    ] {
        let result = analyze(&request(&[
            ("Cargo.toml", MANIFEST),
            ("src/lib.rs", source),
            ("src/x.rs", ""),
            ("src/x/child.rs", ""),
            ("src/other/child.rs", ""),
        ]))
        .unwrap();
        assert!(imports(&result).is_empty(), "{source}");
        assert!(!result
            .nodes
            .iter()
            .find(|n| n.path == "src/lib.rs")
            .unwrap()
            .parsing
            .diagnostics
            .is_empty());
    }
}

#[test]
fn path_without_cargo_does_not_guess_default_filename() {
    let result = analyze(&request(&[
        (
            "src/lib.rs",
            "#[path=\"chosen.rs\"] mod x; use crate::x::Thing;",
        ),
        ("src/x.rs", ""),
        ("src/chosen.rs", ""),
    ]))
    .unwrap();
    assert!(imports(&result).is_empty());
    assert!(result
        .nodes
        .iter()
        .find(|n| n.path == "src/lib.rs")
        .unwrap()
        .parsing
        .diagnostics
        .iter()
        .any(|d| d.contains("supported Cargo target")));
}

#[test]
fn path_edit_invalidates_incremental_module_index() {
    let disk = root("incremental");
    for (path, source) in [
        ("Cargo.toml", MANIFEST),
        ("src/lib.rs", "#[path=\"a.rs\"] mod selected; mod consumer;"),
        ("src/a.rs", "pub struct Thing;"),
        ("src/b.rs", "pub struct Thing;"),
        ("src/consumer.rs", "use crate::selected::Thing;"),
    ] {
        put(&disk, path, source);
    }
    let (first, cache) = repository::scan_incremental(&disk, None, |_| Ok(())).unwrap();
    assert!(first
        .graph
        .edges
        .iter()
        .any(|e| e.source == "src/consumer.rs" && e.target == "src/a.rs"));
    let (unchanged, cache) = repository::scan_incremental(&disk, Some(&cache), |_| Ok(())).unwrap();
    assert_eq!(unchanged.changes.parsed, 0);
    put(
        &disk,
        "src/lib.rs",
        "#[path=\"b.rs\"] mod selected; mod consumer; // revised",
    );
    let (next, _) = repository::scan_incremental(&disk, Some(&cache), |_| Ok(())).unwrap();
    assert!(next
        .graph
        .edges
        .iter()
        .any(|e| e.source == "src/consumer.rs" && e.target == "src/b.rs"));
    assert!(!next
        .graph
        .edges
        .iter()
        .any(|e| e.source == "src/consumer.rs" && e.target == "src/a.rs"));
    assert_eq!(next.changes.reused, 0);
    assert!(next
        .graph
        .nodes
        .iter()
        .any(|n| n.parsing.version.starts_with("syntax-v5/")));
}

#[test]
fn path_custom_target_roots_and_logical_parent_imports() {
    let result = analyze(&request(&[
        ("Cargo.toml", "[package]\nname='paths'\nedition='2021'\n[lib]\npath='engine/root.rs'"),
        ("engine/root.rs", "#[path=\"../impl/entry.rs\"] mod renamed; mod inline { #[path=\"value.rs\"] mod item; }"),
        ("impl/entry.rs", "mod child; use crate::inline::item::Thing;"),
        ("impl/child.rs", "use super::Thing; use crate::Root;"),
        ("engine/inline/value.rs", ""),
    ])).unwrap();
    let expected = [
        ("engine/root.rs", "impl/entry.rs"),
        ("engine/root.rs", "engine/inline/value.rs"),
        ("impl/entry.rs", "impl/child.rs"),
        ("impl/entry.rs", "engine/inline/value.rs"),
        ("impl/child.rs", "impl/entry.rs"),
        ("impl/child.rs", "engine/root.rs"),
    ]
    .into_iter()
    .map(|(a, b)| (a.into(), b.into()))
    .collect();
    assert_eq!(imports(&result), expected);
}
