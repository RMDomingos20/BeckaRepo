use crate::RepositoryFile;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

#[derive(Clone)]
pub struct Relation {
    pub target: String,
    pub kind: String,
    pub detail: String,
    pub evidence: Option<crate::syntax::Evidence>,
}

pub struct Extraction {
    pub package_imports: Vec<crate::packages::Import>,
    pub relations: Vec<Relation>,
    pub report: crate::syntax::Report,
}
impl Extraction {
    pub fn bytes(&self) -> usize {
        self.package_imports
            .iter()
            .map(|i| i.module.len() + serde_json::to_vec(&i.evidence).map_or(0, |b| b.len()))
            .sum::<usize>()
            + self
                .relations
                .iter()
                .map(|r| {
                    r.target.len()
                        + r.kind.len()
                        + r.detail.len()
                        + r.evidence.as_ref().map_or(0, |e| {
                            e.engine.len()
                                + e.bindings.iter().map(String::len).sum::<usize>()
                                + e.resolution.as_ref().map_or(0, String::len)
                                + e.symbols
                                    .iter()
                                    .map(|b| {
                                        b.name.len()
                                            + b.kind.len()
                                            + b.alias.as_ref().map_or(0, String::len)
                                    })
                                    .sum::<usize>()
                        })
                })
                .sum::<usize>()
            + self
                .report
                .diagnostics
                .iter()
                .map(String::len)
                .sum::<usize>()
            + self.report.configuration.as_ref().map_or(0, String::len)
            + self
                .report
                .targets
                .iter()
                .map(|t| {
                    t.manifest.len() + t.name.len() + t.kind.len() + t.root.len() + t.module.len()
                })
                .sum::<usize>()
    }
}
pub struct Index {
    // Last components that can match a literal path, a stem or a directory index.
    lookup_names: HashSet<String>,
    paths: HashSet<String>,
    names: HashMap<String, Vec<String>>,
    ids: HashMap<String, Vec<String>>,
    web: crate::web_resolution::WebResolver,
    cargo: crate::cargo_resolution::CargoResolver,
    rust: crate::rust_modules::RustModules,
    config_error: Option<String>,
}

fn regex(pattern: &str) -> Regex {
    Regex::new(pattern).expect("built-in parser expression")
}

static ID: LazyLock<Regex> = LazyLock::new(|| regex(r"(?m)^[ \t]*-?[ \t]*id:\s*(\S+)"));
static PARENT: LazyLock<Regex> = LazyLock::new(|| regex(r"(?m)^[ \t]+parent:\s*(\S+)"));
static SPRITE: LazyLock<Regex> = LazyLock::new(|| regex(r#"(?i)sprite:\s+([^\s\n#'"]+\.rsi)"#));
static PY_FROM: LazyLock<Regex> = LazyLock::new(|| regex(r"(?m)^from\s+(\.[\w.]*)\s+import"));
static PY_IMPORT: LazyLock<Regex> = LazyLock::new(|| regex(r"(?m)^import\s+([\w.]+)"));
static GO: LazyLock<Regex> = LazyLock::new(|| regex(r#"import\s+(?:\([^)]+\)|"[^"]+")"#));
static QUOTED: LazyLock<Regex> = LazyLock::new(|| regex(r#""([^"]+)""#));
static CSS: LazyLock<Regex> = LazyLock::new(|| regex(r#"@(?:import|use)\s+['"]([^'"]+)['"]"#));
static RUST_USE: LazyLock<Regex> = LazyLock::new(|| regex(r"\buse\s+([\w:]+)(?:;|::)"));
static RUST_MOD: LazyLock<Regex> = LazyLock::new(|| regex(r"\bmod\s+(\w+)\s*;"));
static GENERIC: LazyLock<Regex> = LazyLock::new(|| {
    regex(
        r"(?i)([a-zA-Z0-9_./\\-]+\.(?:png|jpg|jpeg|gif|svg|webp|ico|mp3|mp4|wav|ogg|ttf|woff|woff2|css|scss|json|yml|yaml|toml|xml|csv|txt|md|rsi|cs|js|ts|py|cpp|c|h|go|rs|java|kt|dart|lua))",
    )
});

struct Rule {
    exts: &'static [&'static str],
    kind: &'static str,
    pattern: Regex,
    local: bool,
    namespace: bool,
}

static RULES: LazyLock<Vec<Rule>> = LazyLock::new(|| {
    let web: &[&str] = &["js", "jsx", "ts", "tsx", "mjs", "cjs", "vue", "svelte"];
    vec![
        Rule {
            exts: &["html", "htm"],
            kind: "script",
            pattern: regex(r#"(?i)<script[^>]+src\s*=\s*['"]([^'"]+)['"]"#),
            local: false,
            namespace: false,
        },
        Rule {
            exts: &["html", "htm"],
            kind: "stylesheet",
            pattern: regex(r#"(?i)<link[^>]+href\s*=\s*['"]([^'"]+)['"]"#),
            local: false,
            namespace: false,
        },
        Rule {
            exts: web,
            kind: "import",
            pattern: regex(r#"import\s+(?:type\s+)?(?:[^'"`\n;]*?from\s+)?['"`]([^'"`\n]+)['"`]"#),
            local: true,
            namespace: false,
        },
        Rule {
            exts: web,
            kind: "import",
            pattern: regex(r#"import\s+['"`]([^'"`\n]+)['"`]"#),
            local: true,
            namespace: false,
        },
        Rule {
            exts: web,
            kind: "require",
            pattern: regex(r#"(?:require|import)\s*\(\s*['"`]([^'"`\n]+)['"`]\s*\)"#),
            local: true,
            namespace: false,
        },
        Rule {
            exts: web,
            kind: "re-export",
            pattern: regex(r#"export\s+(?:\*|\{[^}]*\})\s+from\s+['"`]([^'"`\n]+)['"`]"#),
            local: true,
            namespace: false,
        },
        Rule {
            exts: &["c", "cpp", "h", "hpp", "cc"],
            kind: "include",
            pattern: regex(r#"#include\s+["<]([^">]+)[">]"#),
            local: false,
            namespace: false,
        },
        Rule {
            exts: &["cs", "java", "php", "kt", "dart", "scala"],
            kind: "import",
            pattern: regex(r"(?:import|using|use)\s+([\w\\]+(?:\.[\w\\]+)*)[\s;]"),
            local: false,
            namespace: true,
        },
    ]
});

fn parent(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(dir, _)| dir)
}
fn join(dir: &str, name: &str) -> String {
    if dir.is_empty() {
        name.into()
    } else {
        format!("{dir}/{name}")
    }
}
fn normalize(path: &str) -> String {
    let mut parts = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            _ => parts.push(part),
        }
    }
    parts.join("/")
}

impl Index {
    pub fn new(files: &[RepositoryFile]) -> Self {
        let paths = files.iter().map(|file| file.path.clone()).collect();
        let mut index = Self {
            web: crate::web_resolution::WebResolver::new(&paths),
            cargo: crate::cargo_resolution::CargoResolver::new(&paths),
            lookup_names: HashSet::new(),
            paths,
            names: HashMap::new(),
            ids: HashMap::new(),
            config_error: None,
            rust: crate::rust_modules::RustModules::default(),
        };
        for file in files {
            let name = file.path.rsplit('/').next().unwrap();
            index.lookup_names.insert(name.into());
            if let Some((stem, _)) = name.rsplit_once('.') {
                index.lookup_names.insert(stem.into());
            }
            if matches!(name, "index.js" | "index.jsx" | "index.ts" | "index.tsx") {
                index
                    .lookup_names
                    .insert(parent(&file.path).rsplit('/').next().unwrap_or("").into());
            }
            index
                .names
                .entry(name.into())
                .or_default()
                .push(file.path.clone());
            let base = name.split('.').next().unwrap();
            if base != name && !base.is_empty() {
                index
                    .names
                    .entry(base.into())
                    .or_default()
                    .push(file.path.clone());
            }
            index.add_content(file);
        }
        // JSON-request mode already has bounded sources. Desktop fills these on demand.
        let supplied: HashMap<_, _> = files
            .iter()
            .filter(|f| f.content.is_some())
            .map(|f| (f.path.as_str(), f.content.as_deref()))
            .collect();
        if !supplied.is_empty() {
            for _ in 0..256 {
                let pending = index.pending_configs();
                if pending.is_empty() {
                    break;
                }
                for path in pending {
                    if let Err(error) =
                        index.load_config(&path, supplied.get(path.as_str()).copied().flatten())
                    {
                        index.config_error = Some(error);
                        break;
                    }
                }
                if index.config_error.is_some() {
                    break;
                }
            }
        }
        index.finish();
        index
    }
    pub fn validate(&self) -> Result<(), String> {
        self.config_error.clone().map_or(Ok(()), Err)
    }
    pub fn pending_configs(&self) -> Vec<String> {
        self.web
            .pending()
            .into_iter()
            .chain(self.cargo.pending())
            .collect()
    }
    pub fn config_dependencies(&self) -> impl Iterator<Item = &String> {
        self.web.dependencies().chain(self.cargo.dependencies())
    }
    pub fn load_config(&mut self, path: &str, content: Option<&str>) -> Result<(), String> {
        if path.rsplit('/').next() == Some("Cargo.toml") {
            self.cargo.load(path, content)
        } else {
            self.web.load(path, content, &self.paths)
        }
    }

    pub fn add_content(&mut self, file: &RepositoryFile) {
        let Some(content) = &file.content else {
            return;
        };
        let ext = file.path.rsplit('.').next().unwrap_or("").to_lowercase();
        if ext == "rs" && self.config_error.is_none() {
            if let Err(error) = self.rust.add(&file.path, content) {
                self.config_error = Some(error);
            }
        }
        if ["yml", "yaml"].contains(&ext.as_str()) {
            for m in ID.captures_iter(content) {
                self.add_id(&m[1], &file.path);
            }
        }
        if file.name == "meta.json" && file.path.contains(".rsi/") {
            let parts: Vec<_> = parent(&file.path).split('/').collect();
            for i in 0..parts.len().saturating_sub(1) {
                self.add_id(&parts[i..].join("/"), &file.path);
            }
        }
    }

    pub fn finish(&mut self) {
        self.web.finish();
        if let Err(error) = self.cargo.finish(&self.paths) {
            self.config_error = Some(error);
        }
        if let Err(error) = self
            .cargo
            .targets(&self.paths)
            .and_then(|targets| self.rust.finish(targets, &self.paths))
        {
            self.config_error = Some(error);
        }
        self.ids.retain(|_, paths| paths.len() <= 4);
    }

    fn add_id(&mut self, key: &str, path: &str) {
        if key.len() < 4 {
            return;
        }
        let paths = self.ids.entry(key.into()).or_default();
        if !paths.iter().any(|p| p == path) {
            paths.push(path.into());
        }
    }

    fn find(&self, base: &str) -> Option<String> {
        if let Some(name) = base.rsplit('/').next().filter(|name| !name.is_empty()) {
            if !self.lookup_names.contains(name) {
                return None;
            }
        }
        const SUFFIXES: &[&str] = &[
            "",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            "/index.js",
            "/index.jsx",
            "/index.ts",
            "/index.tsx",
            ".py",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".cs",
            ".c",
            ".cpp",
            ".h",
            ".hpp",
            ".swift",
            ".kt",
            ".dart",
            ".vue",
            ".svelte",
            ".css",
            ".scss",
            ".sass",
            ".less",
        ];
        for suffix in SUFFIXES {
            let value = format!("{base}{suffix}");
            let clean = value
                .split('/')
                .filter(|p| !p.is_empty())
                .collect::<Vec<_>>()
                .join("/");
            for prefix in ["", "src/", "lib/", "app/"] {
                let candidate = format!("{prefix}{clean}");
                if self.paths.contains(&candidate) {
                    return Some(candidate);
                }
            }
        }
        None
    }

    fn resolve(&self, import: &str, from: &str) -> Option<String> {
        if import.is_empty() {
            return None;
        }
        let dir = parent(from);
        if import.starts_with('.') {
            if let Some(path) = self.find(&normalize(&join(dir, import))) {
                return Some(path);
            }
        }
        let clean = import
            .strip_prefix("@/")
            .or_else(|| import.strip_prefix("~/"))
            .unwrap_or(import);
        let clean = clean
            .strip_prefix("src/")
            .unwrap_or(clean)
            .trim_start_matches('/');
        if let Some(path) = self.find(clean).or_else(|| self.find(&join(dir, clean))) {
            return Some(path);
        }
        let name = clean.rsplit(['/', '\\']).next()?;
        let candidates = self.names.get(name)?;
        if candidates.len() == 1 {
            return Some(candidates[0].clone());
        }
        candidates.iter().find(|p| p.contains(clean)).cloned()
    }

    fn rsi_targets(&self, path: &str) -> Vec<String> {
        let parts: Vec<_> = path.split('/').collect();
        for i in 0..parts.len().saturating_sub(1) {
            if let Some(paths) = self.ids.get(&parts[i..].join("/")) {
                return paths.clone();
            }
        }
        Vec::new()
    }

    fn rust_module(&self, import: &str, from: &str) -> Option<String> {
        let mut path = import.replace("::", "/").trim_end_matches('/').to_owned();
        if let Some(rest) = path.strip_prefix("crate/") {
            let root = from.rfind("src/").map_or("src/", |i| &from[..i + 4]);
            path = format!("{root}{rest}");
        } else if let Some(rest) = path.strip_prefix("self/") {
            path = join(parent(from), rest);
        } else if path.starts_with("super/") {
            let mut dir = parent(from);
            while let Some(rest) = path.strip_prefix("super/") {
                path = rest.to_owned();
                dir = parent(dir);
            }
            path = join(dir, &path);
        } else {
            return self.resolve(&path, from);
        }
        loop {
            if let Some(found) = self
                .find(&path)
                .or_else(|| self.find(&format!("{path}/mod.rs")))
            {
                return Some(found);
            }
            path = path.rsplit_once('/')?.0.to_owned();
        }
    }

    pub fn extract(&self, file: &RepositoryFile) -> Extraction {
        let ext = file.path.rsplit('.').next().unwrap_or("").to_lowercase();
        let Some(content) = &file.content else {
            return Extraction {
                package_imports: Vec::new(),
                relations: Vec::new(),
                report: crate::syntax::Report {
                    engine: "not-parsed".into(),
                    version: crate::syntax::VERSION.into(),
                    ..Default::default()
                },
            };
        };
        let Some(mut parsed) = crate::syntax::parse(&ext, content) else {
            return Extraction {
                package_imports: Vec::new(),
                relations: self.regex_extract(file),
                report: crate::syntax::Report {
                    engine: "regex".into(),
                    version: crate::syntax::VERSION.into(),
                    ..Default::default()
                },
            };
        };
        if parsed.report.engine == "regex-fallback" {
            return Extraction {
                package_imports: Vec::new(),
                relations: self.regex_extract(file),
                report: parsed.report,
            };
        }
        let mut relations = Vec::new();
        let mut package_imports = Vec::new();
        if ext == "rs" {
            (parsed.report.targets, parsed.report.targets_omitted) = self.rust.targets(&file.path);
            if self.cargo.has_manifest(&file.path)
                && parsed.report.targets.is_empty()
                && parsed.report.targets_omitted == 0
            {
                parsed.report.diagnostic("Source is not linked to a supported Cargo target; local imports are not guessed from its directory".into());
            }
        }
        let cargo_indexed = ext == "rs"
            && (self.cargo.has_manifest(&file.path)
                || !parsed.report.targets.is_empty()
                || parsed.report.targets_omitted > 0);
        // The directory fallback cannot represent redirected or conditional module trees.
        let requires_module_index = parsed.modules.iter().any(|m| m.path.is_some() || m.blocked);
        if let Some(error) = &self.config_error {
            parsed.report.diagnostic(error.clone());
        }
        {
            let (config, diagnostics) = if ext == "rs" {
                self.cargo.context(&file.path)
            } else {
                self.web.context(&file.path)
            };
            parsed.report.configuration = config;
            for diagnostic in diagnostics {
                parsed.report.diagnostic(diagnostic);
            }
        }
        let inline_dir = if ["lib.rs", "main.rs", "mod.rs"].contains(&file.name.as_str()) {
            parent(&file.path)
        } else {
            file.path.trim_end_matches(".rs")
        };
        let inline_paths: HashSet<String> = parsed
            .inline_modules
            .iter()
            .map(|parts| join(inline_dir, &parts.join("/")))
            .collect();
        let mut seen = HashSet::new();
        let local_names: HashSet<String> = parsed
            .modules
            .iter()
            .filter(|m| m.scope.len() == 1)
            .map(|m| m.scope[0].trim_start_matches("r#").to_owned())
            .collect();
        for mut fact in parsed.facts {
            let target = if ext == "rs" {
                let first = fact.module.split("::").next().unwrap_or("");
                if parsed.unsupported_inner_path {
                    fact.evidence.resolution =
                        Some("Inner path/cfg_attr module context is unsupported".into());
                    None
                } else if !cargo_indexed && requires_module_index {
                    fact.evidence.resolution = Some("Rust path/conditional modules require a supported Cargo target; directory fallback disabled".into());
                    None
                } else if cargo_indexed
                    && (fact.kind == "rust-mod" || ["crate", "self", "super"].contains(&first))
                {
                    let resolved = self.rust.resolve(
                        &file.path,
                        &fact.scope,
                        &fact.module,
                        fact.kind == "rust-mod",
                    );
                    let mut method = resolved.method;
                    if fact.kind == "rust-mod" {
                        let mut scope = fact.scope.clone();
                        scope.push(fact.module.clone());
                        if let Some(path) = parsed
                            .modules
                            .iter()
                            .find(|m| m.scope == scope)
                            .and_then(|m| m.path.as_ref())
                        {
                            method.push_str(&format!(
                                "; explicit #[path = {path:?}] (inventory only)"
                            ));
                        }
                    }
                    fact.evidence.resolution = Some(method);
                    resolved.target
                } else if fact.kind == "rust-mod" {
                    let dir = if ["lib.rs", "main.rs", "mod.rs"].contains(&file.name.as_str()) {
                        parent(&file.path)
                    } else {
                        file.path.trim_end_matches(".rs")
                    };
                    let scoped = crate::web_resolution::relative(dir, &fact.scope.join("/"));
                    let base = scoped
                        .map(|dir| join(&dir, &fact.module))
                        .unwrap_or_default();
                    let candidates: Vec<_> = [format!("{base}.rs"), format!("{base}/mod.rs")]
                        .into_iter()
                        .filter(|p| self.paths.contains(p))
                        .collect();
                    if candidates.len() == 1 {
                        candidates.into_iter().next()
                    } else {
                        None
                    }
                } else {
                    let first = fact.module.split("::").next().unwrap_or("");
                    if ["crate", "self", "super"].contains(&first) {
                        self.syntax_rust_module(
                            &fact.module,
                            &file.path,
                            &fact.scope,
                            &inline_paths,
                        )
                    } else if local_names.contains(first) {
                        fact.evidence.resolution = Some("Cargo dependency name is shadowed by a local module; module index required".into());
                        None
                    } else {
                        let resolved = self.rust_dependency(&fact.module, &file.path, &fact.scope);
                        fact.evidence.resolution = Some(resolved.method);
                        resolved.target
                    }
                }
            } else {
                let resolved = self.web.resolve(&fact.module, &file.path, &self.paths);
                fact.evidence.resolution = Some(resolved.method);
                resolved.target
            };
            let package_candidate = if ext == "rs" {
                let alias = fact
                    .module
                    .trim_start_matches("::")
                    .split("::")
                    .next()
                    .unwrap_or("")
                    .trim_start_matches("r#");
                fact.kind != "rust-mod"
                    && !parsed.unsupported_inner_path
                    && !["crate", "self", "super", "std", "core", "alloc"].contains(&alias)
                    && !local_names.contains(alias)
                    && (fact.scope.is_empty() || fact.module.starts_with("::"))
            } else {
                target.is_none()
            };
            if package_candidate {
                package_imports.push(crate::packages::Import {
                    module: fact.module.clone(),
                    evidence: fact.evidence.clone(),
                });
            }
            if let Some(target) = target {
                if ext == "rs" {
                    fact.evidence.resolution.get_or_insert_with(|| {
                        format!("Rust local module; inline scope: {}", fact.scope.join("::"))
                    });
                    if target == file.path {
                        parsed.report.intra_file_imports += 1;
                        continue;
                    }
                }
                let kind = if fact.kind == "rust-mod" {
                    "import"
                } else {
                    fact.kind
                };
                if seen.insert((target.clone(), kind)) {
                    relations.push(Relation {
                        target,
                        kind: kind.into(),
                        detail: fact.module,
                        evidence: Some(fact.evidence),
                    });
                }
            } else {
                parsed.report.diagnostic(format!(
                    "Unresolved module at line {}: {} ({})",
                    fact.evidence.line,
                    fact.module,
                    fact.evidence
                        .resolution
                        .as_deref()
                        .unwrap_or("external package or unsupported local resolution")
                ));
            }
        }
        Extraction {
            package_imports,
            relations,
            report: parsed.report,
        }
    }

    fn syntax_rust_module(
        &self,
        module: &str,
        from: &str,
        scope: &[String],
        inline: &HashSet<String>,
    ) -> Option<String> {
        let root = from
            .rfind("src/")
            .filter(|&i| i == 0 || from.as_bytes()[i - 1] == b'/')
            .map(|i| &from[..i + 3])?;
        let dir = if ["lib.rs", "main.rs", "mod.rs"].contains(&from.rsplit('/').next()?) {
            parent(from)
        } else {
            from.trim_end_matches(".rs")
        };
        let file_scope = dir.strip_prefix(root)?.trim_start_matches('/');
        let file_parts: Vec<&str> = file_scope.split('/').filter(|s| !s.is_empty()).collect();
        let mut current = file_parts.clone();
        current.extend(scope.iter().map(String::as_str));
        let mut parts = module.split("::");
        let mut absolute = match parts.next()? {
            "crate" => Vec::new(),
            "self" => current,
            "super" => {
                current.pop()?;
                current
            }
            _ => return None,
        };
        let mut rest: Vec<_> = parts.collect();
        while rest.first() == Some(&"super") {
            absolute.pop()?;
            rest.remove(0);
        }
        absolute.extend(rest);
        // Resolve the longest physical module before its symbol suffix.
        for count in (1..=absolute.len()).rev() {
            let path = join(root, &absolute[..count].join("/"));
            if inline.contains(&path) {
                return Some(from.into());
            }
            let candidates: Vec<_> = [format!("{path}.rs"), format!("{path}/mod.rs")]
                .into_iter()
                .filter(|p| self.paths.contains(p))
                .collect();
            if candidates.len() > 1 {
                return None;
            }
            if let Some(candidate) = candidates.into_iter().next() {
                return Some(candidate);
            }
        }
        None
    }

    fn rust_dependency(
        &self,
        module: &str,
        file: &str,
        scope: &[String],
    ) -> crate::web_resolution::Resolution {
        use crate::web_resolution::Resolution;
        let owners = match self.rust.owners(file) {
            Ok(owners) => owners,
            Err(method) => {
                return Resolution {
                    target: None,
                    method,
                }
            }
        };
        let mut selected: Option<Resolution> = None;
        for (manifest, kind) in owners {
            let current = self
                .cargo
                .resolve_in(module, manifest, scope, kind, &self.paths);
            if current.target.is_none() {
                return current;
            }
            if selected
                .as_ref()
                .is_some_and(|prior| prior.target != current.target)
            {
                return Resolution {
                    target: None,
                    method: "Cargo target owners resolve this dependency to different files".into(),
                };
            }
            selected = Some(current);
        }
        selected.unwrap_or(Resolution {
            target: None,
            method: "No Cargo target owner".into(),
        })
    }

    fn regex_extract(&self, file: &RepositoryFile) -> Vec<Relation> {
        let Some(content) = &file.content else {
            return Vec::new();
        };
        let ext = file.path.rsplit('.').next().unwrap_or("").to_lowercase();
        let mut results = Vec::new();
        let mut seen = HashSet::new();
        let mut add = |target: Option<String>, kind: &str, detail: String| {
            if let Some(target) = target {
                if target != file.path && seen.insert((target.clone(), kind.to_owned())) {
                    results.push(Relation {
                        target,
                        kind: kind.into(),
                        detail,
                        evidence: None,
                    });
                }
            }
        };
        for rule in RULES.iter().filter(|r| r.exts.contains(&ext.as_str())) {
            for m in rule.pattern.captures_iter(content) {
                let import = &m[1];
                if rule.local
                    && !["./", "../", "/", "@/", "~/"]
                        .iter()
                        .any(|p| import.starts_with(p))
                {
                    continue;
                }
                let path = if rule.namespace {
                    import.replace(['.', '\\'], "/")
                } else {
                    import.into()
                };
                add(self.resolve(&path, &file.path), rule.kind, import.into());
            }
        }
        if ext == "py" {
            for m in PY_FROM.captures_iter(content) {
                let dots = m[1].chars().take_while(|c| *c == '.').count();
                let module = m[1][dots..].replace('.', "/");
                let parts: Vec<_> = file.path.split('/').collect();
                let dir = parts[..parts.len().saturating_sub(dots).max(1)].join("/");
                let name = if module.is_empty() {
                    "__init__.py".into()
                } else {
                    format!("{module}.py")
                };
                let path = join(&dir, &name);
                add(
                    if self.paths.contains(&path) {
                        Some(path)
                    } else {
                        self.resolve(&module, &file.path)
                    },
                    "import",
                    m[0].trim().chars().take(60).collect(),
                );
            }
            for m in PY_IMPORT.captures_iter(content) {
                add(
                    self.resolve(&m[1].replace('.', "/"), &file.path),
                    "import",
                    m[1].into(),
                );
            }
        }
        if ext == "rs" {
            for m in RUST_USE.captures_iter(content) {
                add(self.rust_module(&m[1], &file.path), "import", m[1].into());
            }
            for m in RUST_MOD.captures_iter(content) {
                let dir = if ["lib.rs", "main.rs", "mod.rs"].contains(&file.name.as_str()) {
                    parent(&file.path).to_owned()
                } else {
                    file.path.trim_end_matches(".rs").to_owned()
                };
                let base = join(&dir, &m[1]);
                add(
                    self.find(&format!("{base}.rs"))
                        .or_else(|| self.find(&format!("{base}/mod.rs"))),
                    "import",
                    format!("mod {}", &m[1]),
                );
            }
        }
        if ext == "go" {
            for block in GO.find_iter(content) {
                for m in QUOTED.captures_iter(block.as_str()) {
                    add(self.resolve(&m[1], &file.path), "import", m[1].into());
                }
            }
        }
        if ["css", "scss", "sass", "less"].contains(&ext.as_str()) {
            for m in CSS.captures_iter(content) {
                let path = if m[1].starts_with('.') {
                    m[1].into()
                } else {
                    format!("./{}", &m[1])
                };
                add(
                    self.resolve(&path, &file.path),
                    "import",
                    m[0].chars().take(50).collect(),
                );
            }
        }
        if ["yaml", "yml"].contains(&ext.as_str()) {
            for m in PARENT.captures_iter(content) {
                if let Some(paths) = self.ids.get(&m[1]) {
                    for path in paths {
                        add(
                            Some(path.clone()),
                            "prototype-parent",
                            format!("parent: {}", &m[1]),
                        );
                    }
                }
            }
            for m in SPRITE.captures_iter(content) {
                let direct = format!("{}/meta.json", &m[1]);
                let paths = if self.paths.contains(&direct) {
                    vec![direct]
                } else {
                    self.rsi_targets(&m[1])
                };
                for path in paths {
                    add(Some(path), "sprite-ref", format!("sprite: {}", &m[1]));
                }
            }
        }
        if ext == "json" && file.path.ends_with("/meta.json") && file.path.contains(".rsi/") {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(content) {
                if let Some(states) = json["states"].as_array() {
                    for state in states {
                        if let Some(name) = state["name"].as_str() {
                            let path = join(parent(&file.path), &format!("{name}.png"));
                            if self.paths.contains(&path) {
                                add(Some(path), "rsi-state", format!("state: {name}"));
                            }
                        }
                    }
                }
            }
        }
        for m in GENERIC.captures_iter(content) {
            let raw = &m[1];
            let clean = raw.trim_start_matches(['.', '/', '\\']);
            if clean.to_lowercase().ends_with(".rsi") {
                let direct = ["", "Resources/", "Resources/Textures/", "Resources/Audio/"]
                    .iter()
                    .map(|prefix| format!("{prefix}{clean}/meta.json"))
                    .find(|path| self.paths.contains(path));
                let paths = direct.map_or_else(|| self.rsi_targets(clean), |path| vec![path]);
                for path in paths {
                    add(Some(path), "rsi-ref", raw.into());
                }
            } else {
                add(self.resolve(clean, &file.path), "reference", raw.into());
            }
        }
        results
    }
}
