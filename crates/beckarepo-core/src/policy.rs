//! Shared file selection and resource limits for native scanning and JSON analysis.
pub const MAX_CONTENT_BYTES: u64 = 500 * 1024;
pub const MAX_TOTAL_CONTENT: usize = 256 * 1024 * 1024;
pub const MAX_FILES: usize = 100_000;
pub const MAX_ASSET_BYTES: u64 = 128 * 1024 * 1024;
const CODE: &[&str] = &[
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "py", "go", "rs", "rb", "java", "cpp",
    "c", "h", "cs", "php", "lua", "kt", "swift", "dart", "css", "scss", "sass", "less", "html",
    "htm", "vue", "svelte", "json", "yaml", "yml", "toml", "xml", "txt", "sh", "bash", "env",
    "ini", "cfg", "csv", "rst", "r", "scala", "clj", "ex", "exs", "elm", "ml", "fs", "fsx",
];
const ASSETS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "mp3", "mp4", "wav", "ogg", "ttf", "woff",
    "woff2",
];
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".next",
    ".nuxt",
    ".svelte-kit",
    "dist",
    "build",
    "out",
    "coverage",
    "__pycache__",
    "venv",
    ".venv",
    "env",
    ".env",
    ".tox",
    "site-packages",
    "bin",
    "obj",
    "target",
    "debug",
    "release",
    ".gradle",
    "vendor",
    "pkg",
    ".bundle",
    ".git",
    ".svn",
    ".hg",
    ".idea",
    ".vscode",
    ".cache",
    ".yarn",
];
const IGNORE_FILES: &[&str] = &[
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "composer.lock",
    ".gitignore",
    ".gitattributes",
    ".prettierrc",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.json",
    "security.md",
    "code_of_conduct.md",
    "contributing.md",
    "license",
    "changelog.md",
    "license.md",
    ".env.local",
    ".env.example",
];

/// Maximum serialized CLI request; decoded content has its own smaller budget.
pub const MAX_REQUEST_BYTES: u64 = MAX_TOTAL_CONTENT as u64 + 64 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileKind {
    Text,
    Asset,
}

/// Conservative name policy. This does not detect credentials embedded in normal source files.
/// It also applies to templates and examples; repository settings cannot override it.
pub fn is_sensitive_path(path: &str) -> bool {
    path.split(['/', '\\']).any(|part| {
        let name = part.to_ascii_lowercase();
        let name = name.trim_end_matches([' ', '.']);
        let ext = name.rsplit('.').next().unwrap_or("");
        name == ".env"
            || name.starts_with(".env.")
            || name.ends_with(".env")
            || [
                ".ssh",
                ".aws",
                ".azure",
                ".kube",
                ".gnupg",
                ".npmrc",
                ".pypirc",
                ".netrc",
                "_netrc",
                "auth.json",
            ]
            .contains(&name)
            || ["pem", "key", "p12", "pfx", "jks", "keystore"].contains(&ext)
            || [
                "credentials",
                "secrets",
                "id_rsa",
                "id_dsa",
                "id_ecdsa",
                "id_ed25519",
            ]
            .iter()
            .any(|prefix| {
                name.strip_prefix(prefix)
                    .is_some_and(|rest| rest.is_empty() || rest.starts_with('.'))
            })
            || name.starts_with("service-account")
            || name.starts_with("service_account")
    })
}

pub fn should_skip_directory(name: &str) -> bool {
    is_sensitive_path(name) || SKIP_DIRS.contains(&name.to_ascii_lowercase().as_str())
}

/// Rust executable sources live in src/bin; other bin folders remain excluded.
pub fn should_skip_directory_at(path: &str) -> bool {
    let mut parts = path.rsplit(['/', '\\']);
    let name = parts.next().unwrap_or("");
    if name.eq_ignore_ascii_case("bin")
        && parts.next().is_some_and(|p| p.eq_ignore_ascii_case("src"))
    {
        return false;
    }
    should_skip_directory(name)
}

pub fn classify(path: &str) -> Option<FileKind> {
    if is_sensitive_path(path) {
        return None;
    }
    let name = path.rsplit(['/', '\\']).next()?.to_ascii_lowercase();
    if IGNORE_FILES.contains(&name.as_str()) {
        return None;
    }
    let ext = name.rsplit('.').next().unwrap_or("");
    if CODE.contains(&ext) || ["dockerfile", "makefile", "go.mod"].contains(&name.as_str()) {
        Some(FileKind::Text)
    } else if ASSETS.contains(&ext) {
        Some(FileKind::Asset)
    } else {
        None
    }
}
