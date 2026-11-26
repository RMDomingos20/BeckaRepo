//! Package facts are separate from the file graph. No installer, network or project execution.
use crate::{
    syntax::Evidence,
    web_resolution::{parent, relative},
    RepositoryFile,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

pub fn is_lock(path: &str) -> bool {
    matches!(
        path.rsplit('/').next(),
        Some(
            "package-lock.json"
                | "Cargo.lock"
                | "npm-shrinkwrap.json"
                | "yarn.lock"
                | "pnpm-lock.yaml"
        )
    )
}
pub fn is_manifest(path: &str) -> bool {
    matches!(
        path.rsplit('/').next(),
        Some("package.json" | "Cargo.toml" | "pom.xml")
    )
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageGraph {
    pub nodes: Vec<Package>,
    pub edges: Vec<PackageEdge>,
    pub diagnostics: Vec<String>,
    pub diagnostics_omitted: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Package {
    pub id: String,
    pub ecosystem: String,
    pub name: String,
    pub alias: String,
    pub manifest: String,
    pub category: String,
    pub origin: String,
    pub declared_version: Option<String>,
    pub resolved_version: Option<String>,
    pub workspace: Option<String>,
    pub lockfile: Option<String>,
    pub location: Option<String>,
    pub state: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageEdge {
    pub source: String,
    pub target: String,
    pub kind: String,
    pub detail: String,
    pub evidence: Option<Evidence>,
}
#[derive(Clone)]
pub struct Import {
    pub module: String,
    pub evidence: Evidence,
}
pub struct Builder {
    docs: BTreeMap<String, Value>,
    pub graph: PackageGraph,
    bytes: usize,
    output_bytes: usize,
    documents: usize,
    declarations: BTreeMap<(String, String), Vec<usize>>,
    ids: HashSet<String>,
    seen: HashSet<(String, String, String)>,
}
fn string(v: &Value, key: &str) -> Option<String> {
    v.get(key)?
        .as_str()
        .filter(|s| s.len() <= 1024 && !s.chars().any(char::is_control))
        .map(str::to_owned)
}
fn id(parts: &[&str]) -> String {
    serde_json::to_string(parts).expect("strings")
}
fn join(dir: &str, file: &str) -> String {
    if dir.is_empty() {
        file.into()
    } else {
        format!("{dir}/{file}")
    }
}
fn ancestors(path: &str) -> Vec<String> {
    let mut dir = parent(path);
    let mut out = vec![dir.to_owned()];
    while !dir.is_empty() {
        dir = parent(dir);
        out.push(dir.to_owned());
    }
    out
}
impl Builder {
    pub fn new() -> Self {
        Self {
            docs: BTreeMap::new(),
            graph: PackageGraph::default(),
            bytes: 0,
            output_bytes: 0,
            documents: 0,
            declarations: BTreeMap::new(),
            ids: HashSet::new(),
            seen: HashSet::new(),
        }
    }
    pub fn diagnostic(&mut self, text: String) {
        if self.graph.diagnostics.len() < 128 {
            self.graph
                .diagnostics
                .push(text.chars().take(1024).collect());
        } else {
            self.graph.diagnostics_omitted += 1;
        }
    }
    pub fn load(&mut self, path: &str, text: Option<&str>) -> Result<(), String> {
        self.documents += 1;
        if self.documents > 512 {
            return Err("Package metadata exceeds 512 documents".into());
        }
        let Some(text) = text else {
            self.docs.insert(path.into(), Value::Null);
            self.diagnostic(format!(
                "{path}: package metadata unavailable or over the file limit"
            ));
            return Ok(());
        };
        self.bytes += text.len();
        if self.bytes > 32 * 1024 * 1024 {
            return Err("Package input exceeds 32 MiB".into());
        }
        if matches!(
            path.rsplit('/').next(),
            Some("yarn.lock" | "pnpm-lock.yaml")
        ) {
            self.diagnostic(format!(
                "{path}: unsupported lockfile format; resolved versions unavailable"
            ));
            return Ok(());
        }
        let doc: Result<Value, String> = if path.ends_with("pom.xml") {
            pom(text)
        } else if path.ends_with(".json") {
            serde_json::from_str(text).map_err(|_| "Invalid JSON".into())
        } else {
            toml::from_str::<toml::Value>(text)
                .map_err(|_| "Invalid TOML".into())
                .and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
        };
        match doc {
            Ok(v) if v.is_object() => {
                self.docs.insert(path.into(), v);
            }
            value => {
                self.docs.insert(path.into(), Value::Null);
                self.diagnostic(format!(
                    "{path}: {}",
                    value.err().unwrap_or("Expected metadata object".into())
                ));
            }
        }
        Ok(())
    }
    fn node(&mut self, node: Package) -> Result<(), String> {
        if !self.ids.insert(node.id.clone()) {
            self.diagnostic(format!(
                "{}: duplicate package identity {}",
                node.manifest, node.alias
            ));
            return Ok(());
        }
        if self.graph.nodes.len() >= 20_000 {
            return Err("Package graph exceeds 20000 nodes".into());
        }
        self.account(&node)?;
        self.graph.nodes.push(node);
        Ok(())
    }
    fn edge(
        &mut self,
        source: &str,
        target: &str,
        kind: &str,
        detail: String,
        evidence: Option<Evidence>,
    ) -> Result<(), String> {
        if self
            .seen
            .insert((source.into(), target.into(), kind.into()))
        {
            if self.graph.edges.len() >= 100_000 {
                return Err("Package graph exceeds 100000 edges".into());
            }
            let edge = PackageEdge {
                source: source.into(),
                target: target.into(),
                kind: kind.into(),
                detail,
                evidence,
            };
            self.account(&edge)?;
            self.graph.edges.push(edge);
        }
        Ok(())
    }
    fn account(&mut self, item: &impl Serialize) -> Result<(), String> {
        self.output_bytes += serde_json::to_vec(item).map_err(|e| e.to_string())?.len();
        if self.output_bytes > 64 * 1024 * 1024 {
            return Err("Package output exceeds 64 MiB".into());
        }
        Ok(())
    }
    pub fn build(&mut self, mut check: impl FnMut() -> Result<(), String>) -> Result<(), String> {
        // Clones are bounded by the aggregate input limit and released after this pass.
        let docs = self.docs.clone();
        for (path, doc) in &docs {
            check()?;
            if doc.is_null() {
                continue;
            }
            if path.ends_with("package.json") {
                self.npm_manifest(path, doc)?;
            } else if path.ends_with("Cargo.toml") {
                self.cargo_manifest(path, doc)?;
            } else if path.ends_with("pom.xml") {
                self.maven_manifest(path, doc)?;
            }
        }
        for (path, doc) in &docs {
            check()?;
            if doc.is_null() {
                continue;
            }
            if path.ends_with("package-lock.json") || path.ends_with("npm-shrinkwrap.json") {
                self.npm_lock(path, doc)?;
            } else if path.ends_with("Cargo.lock") {
                self.cargo_lock(path, doc)?;
            }
        }
        self.resolve_declarations(&mut check)?;
        for (i, p) in self
            .graph
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, p)| p.state == "declared")
        {
            let alias = if p.ecosystem == "cargo" {
                p.alias.replace('-', "_")
            } else {
                p.alias.clone()
            };
            self.declarations
                .entry((p.manifest.clone(), alias))
                .or_default()
                .push(i);
        }
        Ok(())
    }
    fn declaration(&mut self, mut node: Package) -> Result<(), String> {
        node.id = id(&[
            "package",
            &node.ecosystem,
            &node.manifest,
            &node.category,
            &node.alias,
        ]);
        self.edge(
            &node.manifest,
            &node.id,
            "declares",
            format!("{}: {} ({})", node.manifest, node.alias, node.category),
            None,
        )?;
        self.node(node)
    }
    fn npm_manifest(&mut self, path: &str, doc: &Value) -> Result<(), String> {
        for category in [
            "dependencies",
            "devDependencies",
            "optionalDependencies",
            "peerDependencies",
        ] {
            let Some(table) = doc.get(category).and_then(Value::as_object) else {
                continue;
            };
            for (alias, spec) in table {
                let Some(spec) = spec.as_str().filter(|s| s.len() <= 1024) else {
                    self.diagnostic(format!("{path}: invalid dependency {alias}"));
                    continue;
                };
                if alias.len() > 256 {
                    self.diagnostic(format!("{path}: package name exceeds 256 bytes"));
                    continue;
                }
                let (name, version) = if let Some(rest) = spec.strip_prefix("npm:") {
                    rest.rsplit_once('@')
                        .filter(|(name, _)| !name.is_empty())
                        .map(|(n, v)| (n.to_owned(), v.to_owned()))
                        .unwrap_or((rest.into(), "*".into()))
                } else {
                    (alias.clone(), spec.to_owned())
                };
                let origin = if spec.starts_with("workspace:") {
                    "workspace"
                } else if spec.starts_with("file:") || spec.starts_with("link:") {
                    "path"
                } else if spec.contains("://")
                    || spec.starts_with("git")
                    || spec.contains('/') && !spec.starts_with("npm:")
                {
                    "remote"
                } else {
                    "registry"
                };
                let workspace = if origin == "path" {
                    spec.split_once(':')
                        .and_then(|(_, p)| relative(parent(path), p))
                        .map(|p| join(&p, "package.json"))
                        .filter(|p| self.docs.contains_key(p))
                } else if origin == "workspace" {
                    self.npm_workspace(path, &name)
                } else {
                    None
                };
                self.declaration(Package {
                    id: String::new(),
                    ecosystem: "npm".into(),
                    name,
                    alias: alias.clone(),
                    manifest: path.into(),
                    category: category.into(),
                    origin: origin.into(),
                    declared_version: Some(version),
                    resolved_version: None,
                    workspace,
                    lockfile: None,
                    location: None,
                    state: "declared".into(),
                })?;
            }
        }
        Ok(())
    }
    fn npm_workspace(&self, path: &str, name: &str) -> Option<String> {
        let root = ancestors(path)
            .into_iter()
            .map(|d| join(&d, "package.json"))
            .find(|p| {
                self.docs
                    .get(p)
                    .is_some_and(|v| v.get("workspaces").is_some())
            })?;
        let workspaces = &self.docs[&root]["workspaces"];
        let patterns = workspaces
            .as_array()
            .or_else(|| workspaces.get("packages")?.as_array())?;
        let candidates: Vec<_> = self
            .docs
            .iter()
            .filter(|(p, v)| {
                p.ends_with("package.json")
                    && string(v, "name").as_deref() == Some(name)
                    && patterns
                        .iter()
                        .filter_map(Value::as_str)
                        .any(|s| member(parent(&root), s, parent(p)))
            })
            .map(|(p, _)| p.clone())
            .collect();
        (candidates.len() == 1).then(|| candidates[0].clone())
    }
    fn cargo_manifest(&mut self, path: &str, doc: &Value) -> Result<(), String> {
        let workspace = self.cargo_workspace(path, doc);
        for category in ["dependencies", "dev-dependencies", "build-dependencies"] {
            self.cargo_table(path, doc.get(category), category, workspace.as_deref())?;
        }
        if let Some(targets) = doc.get("target").and_then(Value::as_object) {
            for (condition, tables) in targets {
                if condition.len() > 512 {
                    continue;
                }
                for category in ["dependencies", "dev-dependencies", "build-dependencies"] {
                    self.cargo_table(
                        path,
                        tables.get(category),
                        &format!("target.{condition}.{category}"),
                        workspace.as_deref(),
                    )?;
                }
            }
        }
        if doc.get("patch").is_some() || doc.get("replace").is_some() {
            self.diagnostic(format!(
                "{path}: patch/replace not applied; lock association disabled"
            ));
        }
        Ok(())
    }
    fn cargo_workspace(&self, path: &str, doc: &Value) -> Option<String> {
        if doc.get("workspace").is_some() {
            return Some(path.into());
        }
        let explicit = doc.pointer("/package/workspace").and_then(Value::as_str);
        let root = if let Some(p) = explicit {
            join(&relative(parent(path), p)?, "Cargo.toml")
        } else {
            ancestors(path)
                .into_iter()
                .skip(1)
                .map(|d| join(&d, "Cargo.toml"))
                .find(|p| {
                    self.docs
                        .get(p)
                        .is_some_and(|v| v.get("workspace").is_some())
                })?
        };
        let w = self.docs.get(&root)?.get("workspace")?;
        let matches = |key| {
            w.get(key).and_then(Value::as_array).is_some_and(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .any(|s| member(parent(&root), s, parent(path)))
            })
        };
        (matches("members") && !matches("exclude")).then_some(root)
    }
    fn cargo_table(
        &mut self,
        path: &str,
        table: Option<&Value>,
        category: &str,
        workspace: Option<&str>,
    ) -> Result<(), String> {
        let Some(table) = table.and_then(Value::as_object) else {
            return Ok(());
        };
        for (alias, original) in table {
            if alias.len() > 256 {
                continue;
            }
            let mut spec = original.clone();
            let mut base = path;
            if original.get("workspace").and_then(Value::as_bool) == Some(true) {
                if let Some((root, inherited)) = workspace.and_then(|w| {
                    Some((
                        w,
                        self.docs
                            .get(w)?
                            .get("workspace")?
                            .get("dependencies")?
                            .get(alias)?,
                    ))
                }) {
                    spec = inherited.clone();
                    base = root;
                } else {
                    self.diagnostic(format!(
                        "{path}: cannot resolve inherited dependency {alias}"
                    ));
                }
            }
            let name = string(&spec, "package").unwrap_or(alias.clone());
            let version = spec
                .as_str()
                .filter(|s| s.len() <= 1024)
                .map(str::to_owned)
                .or_else(|| string(&spec, "version"));
            let origin = if spec.get("path").is_some() {
                "path"
            } else if spec.get("git").is_some() {
                "git"
            } else if spec.get("registry").is_some() {
                "registry-custom"
            } else if spec.get("workspace").and_then(Value::as_bool) == Some(true) {
                "unresolved"
            } else {
                "registry"
            };
            let local = string(&spec, "path")
                .and_then(|p| relative(parent(base), &p))
                .map(|p| join(&p, "Cargo.toml"))
                .filter(|p| {
                    self.docs
                        .get(p)
                        .and_then(|v| v.pointer("/package/name"))
                        .and_then(Value::as_str)
                        == Some(name.as_str())
                });
            let optional = original
                .get("optional")
                .or_else(|| spec.get("optional"))
                .and_then(Value::as_bool)
                == Some(true);
            self.declaration(Package {
                id: String::new(),
                ecosystem: "cargo".into(),
                name,
                alias: alias.clone(),
                manifest: path.into(),
                category: if optional {
                    format!("{category}:optional")
                } else {
                    category.into()
                },
                origin: origin.into(),
                declared_version: version,
                resolved_version: None,
                workspace: local,
                lockfile: None,
                location: None,
                state: "declared".into(),
            })?;
        }
        Ok(())
    }
    fn maven_manifest(&mut self, path: &str, doc: &Value) -> Result<(), String> {
        self.diagnostic(format!("{path}: direct Maven declarations only; parent/BOM/profiles/properties and Java import-to-artifact mapping not evaluated"));
        for d in doc["dependencies"].as_array().into_iter().flatten() {
            let (Some(group), Some(artifact)) = (string(d, "groupId"), string(d, "artifactId"))
            else {
                continue;
            };
            let name = format!("{group}:{artifact}");
            let alias = format!(
                "{name}:{}:{}",
                string(d, "type").unwrap_or("jar".into()),
                string(d, "classifier").unwrap_or_default()
            );
            self.declaration(Package {
                id: String::new(),
                ecosystem: "maven".into(),
                name: name.clone(),
                alias,
                manifest: path.into(),
                category: string(d, "scope").unwrap_or("compile".into()),
                origin: "repository".into(),
                declared_version: string(d, "version"),
                resolved_version: None,
                workspace: None,
                lockfile: None,
                location: None,
                state: "declared".into(),
            })?;
        }
        Ok(())
    }
    fn npm_lock(&mut self, path: &str, doc: &Value) -> Result<(), String> {
        if !matches!(doc["lockfileVersion"].as_u64(), Some(2 | 3)) {
            self.diagnostic(format!("{path}: only package-lock v2/v3 supported"));
            return Ok(());
        }
        let Some(packages) = doc.get("packages").and_then(Value::as_object) else {
            self.diagnostic(format!("{path}: missing packages table"));
            return Ok(());
        };
        let mut locations = BTreeMap::new();
        for (location, v) in packages {
            if location.is_empty() || location.len() > 1024 || !location.contains("node_modules/") {
                continue;
            }
            let Some(version) = string(v, "version").or_else(|| {
                v.get("link")
                    .and_then(Value::as_bool)
                    .filter(|x| *x)
                    .map(|_| String::new())
            }) else {
                continue;
            };
            if !version.is_empty() && semver::Version::parse(&version).is_err() {
                self.diagnostic(format!("{path}: invalid locked version at {location}"));
                continue;
            }
            let alias = location
                .rsplit_once("node_modules/")
                .map(|(_, n)| n)
                .unwrap_or(location);
            let name = string(v, "name").unwrap_or(alias.into());
            let key = id(&["locked", path, location]);
            let local = if v["link"] == true {
                string(v, "resolved")
                    .and_then(|p| relative(parent(path), &p))
                    .map(|p| join(&p, "package.json"))
                    .filter(|p| self.docs.contains_key(p))
            } else {
                None
            };
            locations.insert(location.clone(), key.clone());
            self.node(Package {
                id: key,
                ecosystem: "npm".into(),
                name,
                alias: alias.into(),
                manifest: path.into(),
                category: "lock".into(),
                origin: if v["link"] == true {
                    "workspace"
                } else {
                    "lockfile"
                }
                .into(),
                declared_version: None,
                resolved_version: (!version.is_empty()).then_some(version),
                workspace: local,
                lockfile: Some(path.into()),
                location: Some(location.clone()),
                state: "locked".into(),
            })?;
        }
        for (location, key) in &locations {
            for kind in ["dependencies", "optionalDependencies"] {
                if let Some(deps) = packages[location].get(kind).and_then(Value::as_object) {
                    for alias in deps.keys() {
                        if let Some(target) = npm_lookup(&locations, location, alias) {
                            self.edge(key,&target,"lock-dependency",format!("{path}: {location} / {kind} / {alias}; installed lock location, not source usage"),None)?;
                        } else {
                            self.diagnostic(format!(
                                "{path}: unresolved lock dependency {location} -> {alias}"
                            ));
                        }
                    }
                }
            }
        }
        Ok(())
    }
    fn cargo_lock(&mut self, path: &str, doc: &Value) -> Result<(), String> {
        if !matches!(doc["version"].as_u64(), Some(3 | 4)) {
            self.diagnostic(format!("{path}: only Cargo.lock v3/v4 supported"));
            return Ok(());
        }
        let Some(packages) = doc.get("package").and_then(Value::as_array) else {
            self.diagnostic(format!("{path}: missing package table"));
            return Ok(());
        };
        let mut records = Vec::new();
        for p in packages {
            let (Some(name), Some(version)) = (string(p, "name"), string(p, "version")) else {
                continue;
            };
            let source = string(p, "source").unwrap_or_default();
            let origin = if source == "registry+https://github.com/rust-lang/crates.io-index"
                || source == "sparse+https://index.crates.io/"
            {
                "registry"
            } else if source.starts_with("registry+") || source.starts_with("sparse+") {
                "registry-custom"
            } else if source.starts_with("git+") {
                "git"
            } else {
                "path"
            };
            // Do not put credentials from source URLs in IDs or UI.
            let key = id(&["locked", path, &records.len().to_string(), &name, &version]);
            records.push((name.clone(), version.clone(), source, key.clone(), p));
            self.node(Package {
                id: key,
                ecosystem: "cargo".into(),
                name: name.clone(),
                alias: name,
                manifest: path.into(),
                category: "lock".into(),
                origin: origin.into(),
                declared_version: None,
                resolved_version: Some(version),
                workspace: None,
                lockfile: Some(path.into()),
                location: None,
                state: "locked".into(),
            })?;
        }
        for (_, _, _, key, p) in &records {
            for dep in p
                .get("dependencies")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
            {
                let mut parts = dep.splitn(3, ' ');
                let name = parts.next().unwrap_or("");
                let version = parts.next();
                let source = parts
                    .next()
                    .map(|s| s.trim_start_matches('(').trim_end_matches(')'));
                let candidates: Vec<_> = records
                    .iter()
                    .filter(|(n, v, s, _, _)| {
                        n == name && version.is_none_or(|x| x == v) && source.is_none_or(|x| x == s)
                    })
                    .collect();
                if candidates.len() == 1 {
                    self.edge(
                        key,
                        &candidates[0].3,
                        "lock-dependency",
                        format!("{path}: {name}; lock dependency, not source usage"),
                        None,
                    )?;
                } else {
                    self.diagnostic(format!("{path}: ambiguous/missing lock dependency {name}"));
                }
            }
        }
        Ok(())
    }
    fn resolve_declarations(
        &mut self,
        check: &mut impl FnMut() -> Result<(), String>,
    ) -> Result<(), String> {
        let all = self.graph.nodes.clone();
        for i in 0..all.len() {
            if i % 64 == 0 {
                check()?;
            }
            let p = &all[i];
            if p.state != "declared" {
                continue;
            }
            let lock = if p.ecosystem == "npm" {
                ancestors(&p.manifest).iter().find_map(|dir| {
                    ["npm-shrinkwrap.json", "package-lock.json"]
                        .iter()
                        .map(|name| join(dir, name))
                        .find(|p| self.docs.contains_key(p))
                })
            } else if p.ecosystem == "cargo" {
                let manifest = &self.docs[&p.manifest];
                let root = self
                    .cargo_workspace(&p.manifest, manifest)
                    .unwrap_or(p.manifest.clone());
                let candidate = join(parent(&root), "Cargo.lock");
                self.docs.contains_key(&candidate).then_some(candidate)
            } else {
                None
            };
            let Some(lock) = lock else {
                continue;
            };
            let candidates: Vec<_> = if p.ecosystem == "npm" {
                let base = parent(&p.manifest)
                    .strip_prefix(parent(&lock))
                    .unwrap_or("")
                    .trim_start_matches('/');
                let entry = self.docs[&lock].get("packages").and_then(|v| v.get(base));
                let raw = self.docs[&p.manifest]
                    .get(&p.category)
                    .and_then(|v| v.get(&p.alias));
                if entry
                    .and_then(|v| v.get(&p.category))
                    .and_then(|v| v.get(&p.alias))
                    != raw
                    || raw.is_none()
                {
                    self.diagnostic(format!(
                        "{}: lock declaration differs for {}; version not associated",
                        p.manifest, p.alias
                    ));
                    continue;
                }
                let locations = all
                    .iter()
                    .filter(|n| n.lockfile.as_ref() == Some(&lock))
                    .filter_map(|n| Some((n.location.clone()?, n.id.clone())))
                    .collect();
                let target = npm_lookup(&locations, base, &p.alias);
                all.iter()
                    .filter(|n| {
                        Some(&n.id) == target.as_ref()
                            && (n.name == p.name && n.workspace.is_none()
                                || n.workspace.as_ref().is_some_and(|w| {
                                    self.docs
                                        .get(w)
                                        .and_then(|v| v.get("name"))
                                        .and_then(Value::as_str)
                                        == Some(p.name.as_str())
                                }))
                    })
                    .collect()
            } else {
                let root = self
                    .cargo_workspace(&p.manifest, &self.docs[&p.manifest])
                    .unwrap_or(p.manifest.clone());
                if [&p.manifest, &root].iter().any(|m| {
                    self.docs[*m].get("patch").is_some() || self.docs[*m].get("replace").is_some()
                }) || p.origin != "registry"
                {
                    continue;
                }
                let Some(req) = p
                    .declared_version
                    .as_ref()
                    .and_then(|v| semver::VersionReq::parse(v).ok())
                else {
                    continue;
                };
                all.iter()
                    .filter(|n| {
                        n.lockfile.as_ref() == Some(&lock)
                            && n.name == p.name
                            && n.origin == "registry"
                            && n.resolved_version
                                .as_ref()
                                .and_then(|v| semver::Version::parse(v).ok())
                                .is_some_and(|v| req.matches(&v))
                    })
                    .collect()
            };
            if candidates.len() == 1 {
                let target = candidates[0];
                self.graph.nodes[i].resolved_version = target.resolved_version.clone();
                self.graph.nodes[i].lockfile = Some(lock.clone());
                if target.workspace.is_some() {
                    self.graph.nodes[i].workspace = target.workspace.clone();
                }
                self.edge(&p.id,&target.id,"resolves-to",format!("{lock}: unique observed lock candidate; lock freshness/build activation not verified"),None)?;
            } else {
                self.diagnostic(format!(
                    "{}: {} has no unique matching lock location/version",
                    p.manifest, p.alias
                ));
            }
        }
        Ok(())
    }
    pub fn imports(
        &mut self,
        file: &RepositoryFile,
        facts: &[Import],
        report: &crate::syntax::Report,
    ) -> Result<(), String> {
        let rust = file.path.ends_with(".rs");
        for fact in facts {
            let alias = if rust {
                fact.module
                    .trim_start_matches("::")
                    .split("::")
                    .next()
                    .unwrap_or("")
                    .trim_start_matches("r#")
                    .to_owned()
            } else {
                npm_name(&fact.module).unwrap_or_default()
            };
            if alias.is_empty() {
                continue;
            }
            let owners: Vec<_> = if rust {
                report
                    .targets
                    .iter()
                    .map(|t| (t.manifest.clone(), t.kind.as_str()))
                    .collect()
            } else {
                ancestors(&file.path)
                    .iter()
                    .map(|dir| join(dir, "package.json"))
                    .find(|p| self.docs.contains_key(p))
                    .map(|p| vec![(p, "web")])
                    .unwrap_or_default()
            };
            if owners.is_empty() || rust && report.targets_omitted > 0 {
                continue;
            }
            let mut agreed: Option<Vec<String>> = None;
            for (owner, kind) in &owners {
                let candidates: Vec<_> = self
                    .declarations
                    .get(&(owner.clone(), alias.clone()))
                    .into_iter()
                    .flatten()
                    .map(|i| &self.graph.nodes[*i])
                    .filter(|p| {
                        p.state == "declared"
                            && p.origin != "unresolved"
                            && &p.manifest == owner
                            && (if rust {
                                p.alias.replace('-', "_") == alias
                            } else {
                                p.alias == alias
                            })
                            && (!rust
                                || p.category == "dependencies" && *kind != "build"
                                || p.category == "build-dependencies" && *kind == "build"
                                || p.category == "dev-dependencies"
                                    && matches!(*kind, "test" | "bench" | "example"))
                    })
                    .map(|p| p.id.clone())
                    .collect();
                if candidates.is_empty() || agreed.as_ref().is_some_and(|a| a != &candidates) {
                    agreed = Some(Vec::new());
                    break;
                }
                agreed = Some(candidates);
            }
            if let Some(ids) = agreed {
                for target in ids {
                    self.edge(&file.path,&target,"imports-package",format!("{}; syntactic import matched declared alias; symbol exports/runtime execution not verified",fact.module),Some(fact.evidence.clone()))?;
                }
            }
        }
        Ok(())
    }
    pub fn finish(self) -> Result<PackageGraph, String> {
        if serde_json::to_vec(&self.graph)
            .map_err(|e| e.to_string())?
            .len()
            > 64 * 1024 * 1024
        {
            return Err("Package output exceeds 64 MiB".into());
        }
        Ok(self.graph)
    }
}
fn member(root: &str, pattern: &str, directory: &str) -> bool {
    if let Some(prefix) = pattern.strip_suffix("/*") {
        relative(root, prefix).is_some_and(|p| parent(directory) == p)
    } else {
        relative(root, pattern).as_deref() == Some(directory)
    }
}
fn npm_lookup(locations: &BTreeMap<String, String>, from: &str, alias: &str) -> Option<String> {
    if npm_name(alias).as_deref() != Some(alias) {
        return None;
    }
    let mut dir = from;
    loop {
        if dir.rsplit('/').next() != Some("node_modules") {
            if let Some(id) = locations.get(&join(dir, &format!("node_modules/{alias}"))) {
                return Some(id.clone());
            }
        }
        if dir.is_empty() {
            return None;
        }
        dir = parent(dir);
    }
}
fn npm_name(module: &str) -> Option<String> {
    if module.starts_with(['.', '/', '#']) || module.contains([':', '\\']) {
        return None;
    }
    let mut parts = module.split('/');
    let first = parts.next()?;
    if first.starts_with('@') {
        let second = parts.next()?;
        (!second.is_empty()).then(|| format!("{first}/{second}"))
    } else {
        (!first.is_empty()).then(|| first.into())
    }
}
fn pom(source: &str) -> Result<Value, String> {
    use quick_xml::{events::Event, Reader};
    let mut reader = Reader::from_str(source);
    reader.config_mut().trim_text(true);
    let mut stack = Vec::<String>::new();
    let mut dependencies = Vec::new();
    let mut dependency = serde_json::Map::new();
    loop {
        match reader.read_event().map_err(|_| "Invalid XML".to_string())? {
            Event::DocType(_) | Event::GeneralRef(_) => {
                return Err("DTD/entities are not supported".into())
            }
            Event::Start(e) => {
                stack.push(e.local_name().as_ref().to_owned());
                if stack.len() > 64 {
                    return Err("XML nesting exceeds 64".into());
                }
            }
            Event::Text(t)
                if stack.len() == 4 && stack[..3] == ["project", "dependencies", "dependency"] =>
            {
                let text = t.xml10_content().into_owned();
                if text.len() > 1024 {
                    return Err("POM value exceeds 1024 bytes".into());
                }
                dependency.insert(stack[3].clone(), Value::String(text));
            }
            Event::End(_) => {
                if stack == ["project", "dependencies", "dependency"] {
                    dependencies.push(Value::Object(std::mem::take(&mut dependency)));
                }
                stack.pop();
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if !stack.is_empty() {
        return Err("Incomplete XML".into());
    }
    Ok(serde_json::json!({"dependencies":dependencies}))
}
