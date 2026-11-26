//! Local config resolution only. No filesystem access, package execution or network.
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;

pub fn parent(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(dir, _)| dir)
}
pub fn relative(dir: &str, value: &str) -> Option<String> {
    if value.starts_with('/') || value.contains(['\\', ':', '\0']) {
        return None;
    }
    let joined = if dir.is_empty() {
        value.to_owned()
    } else {
        format!("{dir}/{value}")
    };
    let mut parts = Vec::new();
    for part in joined.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            _ => parts.push(part),
        }
    }
    Some(parts.join("/"))
}

#[derive(Clone, Default)]
struct Config {
    base: Option<String>,
    // Paths retain the directory where declared, even when inherited.
    paths: Option<Arc<(String, BTreeMap<String, Vec<String>>)>>,
    extends: Vec<String>,
    errors: Vec<String>,
}
#[derive(Default)]
pub struct WebResolver {
    configs: HashMap<String, Config>,
    pending: BTreeMap<String, ()>,
    bytes: usize,
    compiled: HashMap<String, Config>,
}
pub struct Resolution {
    pub target: Option<String>,
    pub method: String,
}

impl WebResolver {
    pub fn new(paths: &HashSet<String>) -> Self {
        let mut result = Self::default();
        for path in paths {
            if ["tsconfig.json", "jsconfig.json"].contains(&path.rsplit('/').next().unwrap_or("")) {
                result.pending.insert(path.clone(), ());
            }
        }
        result
    }
    pub fn pending(&self) -> Vec<String> {
        self.pending.keys().cloned().collect()
    }
    pub fn dependencies(&self) -> impl Iterator<Item = &String> {
        self.configs.keys()
    }
    pub fn load(
        &mut self,
        path: &str,
        content: Option<&str>,
        inventory: &HashSet<String>,
    ) -> Result<(), String> {
        if self.configs.contains_key(path) {
            self.pending.remove(path);
            return Ok(());
        }
        if self.configs.len() >= 256 {
            return Err("Configuration index exceeds 256 files".into());
        }
        self.bytes += content.map_or(0, str::len);
        if self.bytes > 8 * 1024 * 1024 {
            return Err("Configuration input exceeds 8 MiB".into());
        }
        self.pending.remove(path);
        let parsed = content
            .ok_or_else(|| "Configuration unavailable under the scanner policy".to_owned())
            .and_then(jsonc);
        let config = match parsed {
            Ok(value) => parse_config(path, &value, inventory),
            Err(error) => Config {
                errors: vec![error],
                ..Default::default()
            },
        };
        for base in &config.extends {
            if !self.configs.contains_key(base) {
                self.pending.insert(base.clone(), ());
            }
        }
        self.configs.insert(path.into(), config);
        Ok(())
    }
    pub fn finish(&mut self) {
        self.compiled = self
            .configs
            .keys()
            .map(|path| {
                (
                    path.clone(),
                    self.effective(path, &mut Vec::new(), &mut 512),
                )
            })
            .collect();
    }
    fn effective(&self, path: &str, stack: &mut Vec<String>, budget: &mut usize) -> Config {
        if *budget == 0 {
            return Config {
                errors: vec!["Config inheritance exceeds 512 visits".into()],
                ..Default::default()
            };
        }
        *budget -= 1;
        if stack.len() >= 16 || stack.iter().any(|p| p == path) {
            return Config {
                errors: vec![format!(
                    "Config inheritance cycle or depth above 16: {path}"
                )],
                ..Default::default()
            };
        }
        let Some(local) = self.configs.get(path) else {
            return Config {
                errors: vec![format!("Config not loaded: {path}")],
                ..Default::default()
            };
        };
        stack.push(path.into());
        let mut result = Config::default();
        for base in &local.extends {
            let inherited = self.effective(base, stack, budget);
            if inherited.base.is_some() {
                result.base = inherited.base;
            }
            if inherited.paths.is_some() {
                result.paths = inherited.paths;
            }
            result.errors.extend(
                inherited
                    .errors
                    .into_iter()
                    .take(16usize.saturating_sub(result.errors.len())),
            );
        }
        stack.pop();
        if local.base.is_some() {
            result.base = local.base.clone();
        }
        if local.paths.is_some() {
            result.paths = local.paths.clone();
        }
        result.errors.extend(
            local
                .errors
                .iter()
                .take(16usize.saturating_sub(result.errors.len()))
                .cloned(),
        );
        result
    }
    fn nearest(&self, from: &str) -> Option<String> {
        let mut dir = parent(from);
        loop {
            for name in ["tsconfig.json", "jsconfig.json"] {
                let path = relative(dir, name)?;
                if self.configs.contains_key(&path) {
                    return Some(path);
                }
            }
            if dir.is_empty() {
                return None;
            }
            dir = parent(dir);
        }
    }
    pub fn context(&self, from: &str) -> (Option<String>, Vec<String>) {
        let Some(path) = self.nearest(from) else {
            return (None, Vec::new());
        };
        let config = self.compiled.get(&path).cloned().unwrap_or_default();
        (
            Some(path.clone()),
            config
                .errors
                .into_iter()
                .map(|e| format!("{path}: {e}"))
                .collect(),
        )
    }
    pub fn resolve(&self, module: &str, from: &str, inventory: &HashSet<String>) -> Resolution {
        let typed = ["ts", "tsx", "mts", "cts"].contains(&from.rsplit('.').next().unwrap_or(""));
        if module.starts_with("./") || module.starts_with("../") {
            return Resolution {
                target: relative(parent(from), module)
                    .and_then(|base| find(&base, inventory, typed)),
                method: "relative".into(),
            };
        }
        let Some(path) = self.nearest(from) else {
            return Resolution {
                target: None,
                method: "no local config".into(),
            };
        };
        let config = self.compiled.get(&path).cloned().unwrap_or_default();
        if !config.errors.is_empty() {
            return Resolution {
                target: None,
                method: format!("invalid/incomplete config: {path}"),
            };
        }
        if let Some(mapping) = &config.paths {
            let (declared_at, paths) = mapping.as_ref();
            // Exact match first, otherwise longest prefix before the single wildcard.
            let mut matches: Vec<_> = paths
                .iter()
                .filter_map(|(pattern, targets)| {
                    if pattern == module {
                        return Some((usize::MAX, pattern, targets, String::new()));
                    }
                    let (prefix, suffix) = pattern.split_once('*')?;
                    if module.len() < prefix.len() + suffix.len()
                        || !module.starts_with(prefix)
                        || !module.ends_with(suffix)
                    {
                        return None;
                    }
                    Some((
                        prefix.len(),
                        pattern,
                        targets,
                        module[prefix.len()..module.len() - suffix.len()].into(),
                    ))
                })
                .collect();
            matches.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(b.1)));
            if matches.len() > 1 && matches[0].0 == matches[1].0 {
                return Resolution {
                    target: None,
                    method: format!("Ambiguous paths patterns in {path}"),
                };
            }
            if let Some((_, pattern, targets, capture)) = matches.first() {
                let dir = config.base.as_deref().unwrap_or(declared_at);
                for target in *targets {
                    let value = target.replace('*', capture);
                    if let Some(found) =
                        relative(dir, &value).and_then(|base| find(&base, inventory, typed))
                    {
                        return Resolution {
                            target: Some(found),
                            method: format!("{path} paths {pattern}"),
                        };
                    }
                }
                return Resolution {
                    target: None,
                    method: format!("{path} paths {pattern}: no candidate in inventory"),
                };
            }
        }
        Resolution {
            target: config
                .base
                .and_then(|base| relative(&base, module))
                .and_then(|base| find(&base, inventory, typed)),
            method: format!("{path} baseUrl"),
        }
    }
}

fn parse_config(path: &str, value: &Value, inventory: &HashSet<String>) -> Config {
    let mut result = Config::default();
    if !value.is_object() {
        result.errors.push("Config must be an object".into());
        return result;
    }
    let dir = parent(path);
    if let Some(extends) = value.get("extends") {
        let entries = extends
            .as_array()
            .cloned()
            .unwrap_or_else(|| vec![extends.clone()]);
        if entries.len() > 8 {
            result
                .errors
                .push("At most 8 extends entries are supported".into());
        }
        for entry in entries.iter().take(8) {
            let Some(name) = entry
                .as_str()
                .filter(|s| s.len() <= 512 && (s.starts_with("./") || s.starts_with("../")))
            else {
                result
                    .errors
                    .push("Only local relative extends is supported".into());
                continue;
            };
            let found = relative(dir, name).and_then(|base| {
                [base.clone(), format!("{base}.json")]
                    .into_iter()
                    .find(|p| p.ends_with(".json") && inventory.contains(p))
            });
            if let Some(found) = found {
                result.extends.push(found);
            } else {
                result.errors.push(format!(
                    "Base config outside inventory or unavailable: {}",
                    name.chars().take(160).collect::<String>()
                ));
            }
        }
    }
    if value.get("references").is_some() {
        result
            .errors
            .push("Project references require explicit project selection; not resolved".into());
    }
    let Some(options) = value.get("compilerOptions") else {
        return result;
    };
    if !options.is_object() {
        result
            .errors
            .push("compilerOptions must be an object".into());
        return result;
    }
    if let Some(base) = options.get("baseUrl") {
        result.base = base
            .as_str()
            .filter(|s| s.len() <= 512)
            .and_then(|s| relative(dir, s));
        if result.base.is_none() {
            result.errors.push("Invalid/out-of-root baseUrl".into());
        }
    }
    if let Some(paths) = options.get("paths") {
        let Some(paths) = paths.as_object() else {
            result.errors.push("paths must be an object".into());
            return result;
        };
        if paths.len() > 128 {
            result.errors.push("paths exceeds 128 mappings".into());
        }
        let mut map = BTreeMap::new();
        for (pattern, targets) in paths.iter().take(128) {
            let Some(targets) = targets.as_array() else {
                result.errors.push("paths targets must be arrays".into());
                continue;
            };
            if pattern.len() > 512
                || pattern.matches('*').count() > 1
                || targets.len() > 8
                || targets.is_empty()
            {
                result
                    .errors
                    .push("Invalid or excessive paths mapping".into());
                continue;
            }
            let mut values = Vec::new();
            for target in targets {
                if let Some(s) = target.as_str().filter(|s| {
                    s.len() <= 512
                        && s.matches('*').count() <= 1
                        && !s.starts_with('/')
                        && !s.contains(['\\', ':', '\0'])
                }) {
                    values.push(s.to_owned());
                } else {
                    result
                        .errors
                        .push("Invalid/out-of-root paths target".into());
                }
            }
            map.insert(pattern.clone(), values);
        }
        result.paths = Some(Arc::new((dir.into(), map)));
    }
    result.errors.truncate(16);
    result
}

fn find(base: &str, paths: &HashSet<String>, typed: bool) -> Option<String> {
    if typed {
        for (ext, replacements) in [
            (".js", &[".ts", ".tsx", ".d.ts"][..]),
            (".jsx", &[".tsx", ".ts"][..]),
            (".mjs", &[".mts", ".d.mts"][..]),
            (".cjs", &[".cts", ".d.cts"][..]),
        ] {
            if let Some(stem) = base.strip_suffix(ext) {
                for replacement in replacements {
                    let candidate = format!("{stem}{replacement}");
                    if paths.contains(&candidate) {
                        return Some(candidate);
                    }
                }
            }
        }
    }
    if paths.contains(base) {
        return Some(base.into());
    }
    if [
        ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".json",
    ]
    .iter()
    .any(|ext| base.ends_with(ext))
    {
        return None;
    }
    for suffix in [
        "",
        ".ts",
        ".tsx",
        ".d.ts",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".mts",
        ".cts",
        "/index.ts",
        "/index.tsx",
        "/index.d.ts",
        "/index.js",
        "/index.jsx",
    ] {
        let candidate = format!("{base}{suffix}");
        if paths.contains(&candidate) {
            return Some(candidate);
        }
    }
    None
}

// Strip JSONC comments/trailing commas without altering string contents or UTF-8 boundaries.
fn jsonc(source: &str) -> Result<Value, String> {
    let mut bytes = source
        .strip_prefix('\u{feff}')
        .unwrap_or(source)
        .as_bytes()
        .to_vec();
    let mut i = 0;
    let mut quoted = false;
    let mut escaped = false;
    while i < bytes.len() {
        if quoted {
            if escaped {
                escaped = false;
            } else if bytes[i] == b'\\' {
                escaped = true;
            } else if bytes[i] == b'"' {
                quoted = false;
            }
            i += 1;
            continue;
        }
        if bytes[i] == b'"' {
            quoted = true;
            i += 1;
            continue;
        }
        if bytes.get(i..i + 2) == Some(b"//") {
            while i < bytes.len() && bytes[i] != b'\n' {
                bytes[i] = b' ';
                i += 1;
            }
        } else if bytes.get(i..i + 2) == Some(b"/*") {
            bytes[i] = b' ';
            bytes[i + 1] = b' ';
            i += 2;
            while i + 1 < bytes.len() && &bytes[i..i + 2] != b"*/" {
                bytes[i] = b' ';
                i += 1;
            }
            if i + 1 >= bytes.len() {
                return Err("Unterminated JSONC comment".into());
            }
            bytes[i] = b' ';
            bytes[i + 1] = b' ';
            i += 2;
        } else {
            i += 1;
        }
    }
    quoted = false;
    escaped = false;
    for i in 0..bytes.len() {
        if quoted {
            if escaped {
                escaped = false;
            } else if bytes[i] == b'\\' {
                escaped = true;
            } else if bytes[i] == b'"' {
                quoted = false;
            }
        } else if bytes[i] == b'"' {
            quoted = true;
        } else if bytes[i] == b','
            && bytes[i + 1..]
                .iter()
                .find(|b| !b.is_ascii_whitespace())
                .is_some_and(|b| [b']', b'}'].contains(b))
        {
            bytes[i] = b' ';
        }
    }
    serde_json::from_slice(&bytes).map_err(|e| format!("Invalid JSONC: {e}"))
}
