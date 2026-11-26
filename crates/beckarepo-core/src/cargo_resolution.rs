//! Declarative local Cargo dependencies. Never invokes Cargo or reads outside the inventory.
use crate::web_resolution::{parent, relative, Resolution};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use toml::Value;

#[derive(Clone)]
pub struct Target {
    pub manifest: String,
    pub name: String,
    pub kind: String,
    pub root: String,
}

#[derive(Clone, Default)]
struct Dependency {
    path: Option<String>,
    package: Option<String>,
    workspace: bool,
    optional: bool,
}
#[derive(Default)]
struct Manifest {
    package: Option<String>,
    edition: Option<String>,
    workspace_edition: Option<String>,
    workspace: Option<String>,
    is_workspace: bool,
    members: Vec<String>,
    exclude: Vec<String>,
    library: Option<String>,
    library_name: Option<String>,
    build_script: Option<String>,
    dependencies: BTreeMap<String, Dependency>,
    shared: BTreeMap<String, Dependency>,
    diagnostics: Vec<String>,
    invalid: bool,
    targets: Vec<(String, String, Option<String>)>,
    automatic: [Option<bool>; 4],
    explicit_library: bool,
}

#[derive(Default)]
pub struct CargoResolver {
    manifests: BTreeMap<String, Manifest>,
    pending: BTreeSet<String>,
    bytes: usize,
    resolved: HashMap<String, BTreeMap<String, Resolution>>,
}

fn string(value: Option<&Value>) -> Result<Option<String>, String> {
    value
        .map(|v| {
            v.as_str()
                .filter(|s| s.len() <= 512)
                .map(str::to_owned)
                .ok_or_else(|| "Expected a string of at most 512 bytes".into())
        })
        .transpose()
}
fn boolean(value: Option<&Value>) -> Result<bool, String> {
    value
        .map(|v| v.as_bool().ok_or_else(|| "Expected a boolean".into()))
        .unwrap_or(Ok(false))
}
fn patterns(value: Option<&Value>) -> Result<Vec<String>, String> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let array = value
        .as_array()
        .filter(|a| a.len() <= 256)
        .ok_or("Workspace patterns exceed 256 entries or are invalid")?;
    array
        .iter()
        .map(|v| {
            let s = string(Some(v))?.unwrap();
            // Exact paths and one terminal /* cover the common layout without approximating other globs.
            let base = s.strip_suffix("/*").unwrap_or(&s);
            if base.contains(['*', '?', '[', ']', '{', '}', '\\', ':']) || base.starts_with('/') {
                return Err(
                    "Workspace pattern unsupported (only exact paths and terminal /*)".into(),
                );
            }
            Ok(s)
        })
        .collect()
}
fn dependencies(value: Option<&Value>) -> Result<BTreeMap<String, Dependency>, String> {
    let Some(value) = value else {
        return Ok(BTreeMap::new());
    };
    let table = value
        .as_table()
        .filter(|t| t.len() <= 256)
        .ok_or("Dependency table exceeds 256 entries or is invalid")?;
    table
        .iter()
        .map(|(name, value)| {
            if name.len() > 512 {
                return Err("Dependency name exceeds 512 bytes".into());
            }
            let dep = if value.is_str() {
                Dependency::default()
            } else if value.is_table() {
                Dependency {
                    path: string(value.get("path"))?,
                    package: string(value.get("package"))?,
                    workspace: boolean(value.get("workspace"))?,
                    optional: boolean(value.get("optional"))?,
                }
            } else {
                return Err("Invalid dependency declaration".into());
            };
            if dep.workspace && (dep.path.is_some() || dep.package.is_some()) {
                return Err("Inherited dependency also declares path/package".into());
            }
            Ok((name.clone(), dep))
        })
        .collect()
}
fn parse(path: &str, text: &str) -> Result<Manifest, String> {
    let value: Value = text
        .parse()
        .map_err(|e: toml::de::Error| format!("Invalid Cargo TOML: {e}"))?;
    let package = value.get("package");
    let workspace = value.get("workspace");
    let lib = value.get("lib");
    if lib.and_then(|l| l.get("edition")).is_some() {
        return Err("Per-target Rust edition overrides are not supported".into());
    }
    for (name, table) in [("package", package), ("workspace", workspace), ("lib", lib)] {
        if table.is_some_and(|v| !v.is_table()) {
            return Err(format!("Cargo {name} must be a table"));
        }
    }
    let build_script = match package.and_then(|p| p.get("build")) {
        Some(Value::Boolean(false)) => None,
        None | Some(Value::Boolean(true)) => relative(parent(path), "build.rs"),
        Some(value) => Some(
            relative(parent(path), &string(Some(value))?.unwrap())
                .ok_or("Build-script path escapes the inventory or is unsupported")?,
        ),
    };
    let mut manifest = Manifest {
        package: string(package.and_then(|p| p.get("name")))?,
        edition: string(
            package
                .and_then(|p| p.get("edition"))
                .filter(|v| !v.is_table()),
        )?,
        workspace_edition: string(
            workspace
                .and_then(|w| w.get("package"))
                .and_then(|p| p.get("edition")),
        )?,
        workspace: string(package.and_then(|p| p.get("workspace")))?,
        is_workspace: workspace.is_some(),
        members: patterns(workspace.and_then(|w| w.get("members")))?,
        exclude: patterns(workspace.and_then(|w| w.get("exclude")))?,
        library: string(lib.and_then(|l| l.get("path")))?,
        library_name: string(lib.and_then(|l| l.get("name")))?,
        build_script,
        explicit_library: lib.is_some(),
        dependencies: dependencies(value.get("dependencies"))?,
        shared: dependencies(workspace.and_then(|w| w.get("dependencies")))?,
        ..Default::default()
    };
    // Inherited editions are resolved together with workspace membership below.
    if package
        .and_then(|p| p.get("edition"))
        .is_some_and(Value::is_table)
    {
        if package
            .and_then(|p| p.get("edition"))
            .and_then(|e| e.get("workspace"))
            .and_then(Value::as_bool)
            != Some(true)
        {
            return Err("Invalid inherited edition".into());
        }
        manifest.edition = Some("workspace".into());
    }
    if manifest.is_workspace {
        manifest.diagnostics.push("Cargo workspace membership supports exact paths and terminal /*; implicit path members are not inferred".into());
    }
    if [
        "target",
        "dev-dependencies",
        "build-dependencies",
        "patch",
        "replace",
    ]
    .iter()
    .any(|key| value.get(key).is_some())
    {
        manifest.diagnostics.push(
            "Cargo target/dev/build dependencies and patch/replace overrides are not resolved"
                .into(),
        );
    }
    if value.get("patch").is_some() || value.get("replace").is_some() {
        manifest.invalid = true;
    }
    if manifest.package.is_some() {
        if lib.is_none()
            && package
                .and_then(|p| p.get("autolib"))
                .and_then(Value::as_bool)
                == Some(false)
        {
            manifest.library = None;
        } else {
            manifest.library = Some(
                relative(
                    parent(path),
                    manifest.library.as_deref().unwrap_or("src/lib.rs"),
                )
                .ok_or("Library path escapes the inventory or uses an unsupported path")?,
            );
        }
        for (index, (kind, flag)) in [
            ("bin", "autobins"),
            ("example", "autoexamples"),
            ("test", "autotests"),
            ("bench", "autobenches"),
        ]
        .iter()
        .enumerate()
        {
            manifest.automatic[index] = package
                .and_then(|p| p.get(flag))
                .map(|v| boolean(Some(v)))
                .transpose()?;
            if let Some(targets) = value.get(kind) {
                let targets = targets
                    .as_array()
                    .filter(|a| a.len() <= 128)
                    .ok_or("Cargo targets exceed 128 entries or are invalid")?;
                for target in targets {
                    if target.get("edition").is_some() {
                        return Err("Per-target Rust edition overrides are not supported".into());
                    }
                    let name = string(target.get("name"))?
                        .filter(|s| !s.is_empty() && !s.contains(['/', '\\', ':']))
                        .ok_or("Invalid Cargo target name")?;
                    if manifest
                        .targets
                        .iter()
                        .any(|(k, n, _)| k == kind && n == &name)
                    {
                        return Err("Duplicate Cargo target name within the same kind".into());
                    }
                    let root = string(target.get("path"))?
                        .map(|p| relative(parent(path), &p).ok_or("Target path escapes inventory"))
                        .transpose()?;
                    manifest.targets.push((kind.to_string(), name, root));
                }
            }
        }
    }
    Ok(manifest)
}

impl CargoResolver {
    pub fn targets(&self, paths: &HashSet<String>) -> Result<Vec<Target>, String> {
        let mut targets = Vec::new();
        for (manifest_path, manifest) in &self.manifests {
            if manifest.invalid || manifest.package.is_none() {
                continue;
            }
            let dir = parent(manifest_path);
            let package = manifest.package.as_deref().unwrap();
            let mut add = |kind: &str, name: &str, root: &str| {
                if targets.len() <= 4096 && paths.contains(root) && root.ends_with(".rs") {
                    targets.push(Target {
                        manifest: manifest_path.clone(),
                        name: name.into(),
                        kind: kind.into(),
                        root: root.into(),
                    });
                }
            };
            if let Some(root) = &manifest.library {
                add(
                    "lib",
                    &manifest
                        .library_name
                        .as_deref()
                        .unwrap_or(package)
                        .replace('-', "_"),
                    root,
                );
            }
            if let Some(root) = &manifest.build_script {
                add("build", "build-script", root);
            }
            for (i, (kind, folder)) in [
                ("bin", "src/bin"),
                ("example", "examples"),
                ("test", "tests"),
                ("bench", "benches"),
            ]
            .iter()
            .enumerate()
            {
                let mut discovered: BTreeMap<String, Vec<String>> = BTreeMap::new();
                let folder = relative(dir, folder).unwrap();
                let prefix = format!("{folder}/");
                for path in paths {
                    let Some(rest) = path.strip_prefix(&prefix) else {
                        continue;
                    };
                    let name = if !rest.contains('/') {
                        rest.strip_suffix(".rs")
                    } else {
                        rest.strip_suffix("/main.rs").filter(|s| !s.contains('/'))
                    };
                    if let Some(name) = name {
                        discovered
                            .entry(name.into())
                            .or_default()
                            .push(path.clone());
                    }
                }
                if *kind == "bin" {
                    let main = relative(dir, "src/main.rs").unwrap();
                    if paths.contains(&main) {
                        discovered.entry(package.into()).or_default().push(main);
                    }
                }
                for (declared_kind, name, explicit) in &manifest.targets {
                    if declared_kind != kind {
                        continue;
                    }
                    let candidates = discovered.remove(name).unwrap_or_default();
                    if let Some(root) = explicit {
                        add(kind, name, root);
                    } else if candidates.len() == 1 {
                        add(kind, name, &candidates[0]);
                    }
                }
                let edition = if manifest.edition.as_deref() == Some("workspace") {
                    self.workspace(manifest_path, manifest)
                        .ok()
                        .and_then(|(_, w)| w.workspace_edition.as_deref())
                } else {
                    manifest.edition.as_deref()
                };
                let automatic = manifest.automatic[i].unwrap_or(
                    matches!(edition, Some("2018" | "2021" | "2024"))
                        || (!manifest.explicit_library && manifest.targets.is_empty()),
                );
                if automatic {
                    for (name, candidates) in discovered {
                        if candidates.len() == 1 {
                            let root = &candidates[0];
                            if !manifest
                                .targets
                                .iter()
                                .any(|(k, _, path)| k == kind && path.as_ref() == Some(root))
                            {
                                add(kind, &name, root);
                            }
                        }
                    }
                }
            }
            if targets.len() > 4096 {
                return Err("Cargo target index exceeds 4096 targets".into());
            }
        }
        targets.sort_by(|a, b| {
            (&a.manifest, &a.kind, &a.name, &a.root).cmp(&(&b.manifest, &b.kind, &b.name, &b.root))
        });
        Ok(targets)
    }

    pub fn has_manifest(&self, from: &str) -> bool {
        self.nearest(from).is_some()
    }

    pub fn new(paths: &HashSet<String>) -> Self {
        Self {
            pending: paths
                .iter()
                .filter(|p| p.rsplit('/').next() == Some("Cargo.toml"))
                .cloned()
                .collect(),
            ..Default::default()
        }
    }
    pub fn pending(&self) -> Vec<String> {
        self.pending.iter().cloned().collect()
    }
    pub fn dependencies(&self) -> impl Iterator<Item = &String> {
        self.manifests.keys()
    }
    pub fn load(&mut self, path: &str, content: Option<&str>) -> Result<(), String> {
        if self.manifests.contains_key(path) {
            self.pending.remove(path);
            return Ok(());
        }
        self.bytes += content.map_or(0, str::len);
        if self.manifests.len() >= 256 || self.bytes > 8 * 1024 * 1024 {
            return Err("Cargo index exceeds 256 manifests or 8 MiB of input".into());
        }
        self.pending.remove(path);
        let result = content
            .ok_or_else(|| "Cargo manifest unavailable under scanner policy".to_owned())
            .and_then(|s| parse(path, s));
        self.manifests.insert(
            path.into(),
            result.unwrap_or_else(|error| Manifest {
                invalid: true,
                diagnostics: vec![error.chars().take(1024).collect()],
                ..Default::default()
            }),
        );
        Ok(())
    }
    fn nearest(&self, from: &str) -> Option<(&String, &Manifest)> {
        let mut dir = parent(from);
        loop {
            let path = relative(dir, "Cargo.toml")?;
            if let Some(pair) = self.manifests.get_key_value(&path) {
                return Some(pair);
            }
            if dir.is_empty() {
                return None;
            }
            dir = parent(dir);
        }
    }
    fn workspace<'a>(
        &'a self,
        path: &str,
        manifest: &Manifest,
    ) -> Result<(&'a String, &'a Manifest), String> {
        let candidate = if let Some(explicit) = &manifest.workspace {
            let folder =
                relative(parent(path), explicit).ok_or("Workspace path escapes the inventory")?;
            let candidate = relative(&folder, "Cargo.toml").ok_or("Invalid workspace path")?;
            self.manifests.get_key_value(&candidate)
        } else if manifest.is_workspace {
            self.manifests.get_key_value(path)
        } else {
            let mut dir = parent(path);
            let mut found = None;
            while !dir.is_empty() {
                dir = parent(dir);
                if let Some(pair) = self
                    .manifests
                    .get_key_value(&relative(dir, "Cargo.toml").unwrap())
                {
                    // A malformed closer manifest cannot be silently skipped.
                    if pair.1.is_workspace || pair.1.invalid {
                        found = Some(pair);
                        break;
                    }
                }
            }
            found
        };
        let (root, workspace) = candidate.ok_or("Workspace root unavailable")?;
        if workspace.invalid || !workspace.is_workspace {
            return Err("Workspace configuration is invalid or unsupported".into());
        }
        let matches = |pattern: &String| -> bool {
            let wildcard = pattern.ends_with("/*");
            let base = pattern.strip_suffix("/*").unwrap_or(pattern);
            let Some(folder) = relative(parent(root), base) else {
                return false;
            };
            if wildcard {
                parent(parent(path)) == folder && parent(path) != folder
            } else {
                parent(path) == folder
            }
        };
        if root != path
            && (workspace.exclude.iter().any(matches) || !workspace.members.iter().any(matches))
        {
            return Err("Package is not an explicit supported workspace member".into());
        }
        Ok((root, workspace))
    }
    pub fn finish(&mut self, paths: &HashSet<String>) -> Result<(), String> {
        self.resolved.clear();
        let mut bytes = 0;
        for (path, manifest) in &self.manifests {
            let mut imports = BTreeMap::new();
            for (name, declared) in &manifest.dependencies {
                let result = self.resolve_dependency(path, manifest, name, declared, paths);
                let (alias, resolution) = match result {
                    Ok((alias, target, method)) => (
                        alias,
                        Resolution {
                            target: Some(target),
                            method,
                        },
                    ),
                    Err(error) => (
                        name.replace('-', "_"),
                        Resolution {
                            target: None,
                            method: error,
                        },
                    ),
                };
                bytes += alias.len()
                    + resolution.method.len()
                    + resolution.target.as_ref().map_or(0, String::len);
                if bytes > 32 * 1024 * 1024 {
                    self.resolved.clear();
                    return Err("Resolved Cargo metadata exceeds 32 MiB".into());
                }
                if imports.contains_key(&alias) {
                    imports.insert(
                        alias,
                        Resolution {
                            target: None,
                            method: "Ambiguous Cargo dependency alias".into(),
                        },
                    );
                } else {
                    imports.insert(alias, resolution);
                }
            }
            self.resolved.insert(path.clone(), imports);
        }
        Ok(())
    }
    fn resolve_dependency(
        &self,
        path: &str,
        manifest: &Manifest,
        name: &str,
        declared: &Dependency,
        paths: &HashSet<String>,
    ) -> Result<(String, String, String), String> {
        if manifest.invalid || manifest.package.is_none() {
            return Err("Cargo package configuration unavailable or unsupported".into());
        }
        let workspace = self.workspace(path, manifest);
        // Root overrides also affect dependencies declared by members.
        if workspace
            .as_ref()
            .is_err_and(|e| e == "Workspace configuration is invalid or unsupported")
        {
            return Err("Workspace configuration is invalid or unsupported".into());
        }
        let edition = if manifest.edition.as_deref() == Some("workspace") {
            workspace
                .as_ref()
                .ok()
                .and_then(|(_, w)| w.workspace_edition.as_deref())
        } else {
            manifest.edition.as_deref()
        };
        if !matches!(edition, Some("2018" | "2021" | "2024")) {
            return Err("Cargo dependency imports require a known edition >= 2018; extern crate is not modeled".into());
        }
        let (origin, dependency) = if declared.workspace {
            let (root, workspace) = workspace?;
            (
                root.as_str(),
                workspace
                    .shared
                    .get(name)
                    .ok_or("Inherited dependency missing from workspace.dependencies")?,
            )
        } else {
            (path, declared)
        };
        if declared.optional || dependency.optional {
            return Err("Optional Cargo dependency: feature activation is not evaluated".into());
        }
        if dependency.workspace {
            return Err("Nested workspace dependency inheritance is invalid".into());
        }
        let folder = relative(
            parent(origin),
            dependency
                .path
                .as_deref()
                .ok_or("Cargo dependency has no local path in the inventory")?,
        )
        .ok_or("Dependency path escapes the inventory or is unsupported")?;
        let target_manifest = relative(&folder, "Cargo.toml").ok_or("Invalid dependency path")?;
        let target = self
            .manifests
            .get(&target_manifest)
            .ok_or("Dependency Cargo.toml not in the permitted inventory")?;
        if target.invalid {
            return Err("Dependency Cargo.toml is invalid or unsupported".into());
        }
        if target.package.as_deref() != Some(dependency.package.as_deref().unwrap_or(name)) {
            return Err("Dependency package name does not match its Cargo.toml".into());
        }
        let library = target
            .library
            .as_ref()
            .filter(|p| paths.contains(*p))
            .ok_or("Dependency library source is not in the permitted inventory")?;
        let alias = if dependency.package.is_some() {
            name.to_owned()
        } else {
            target.library_name.as_deref().unwrap_or(name).to_owned()
        }
        .replace('-', "_");
        Ok((alias, library.clone(), format!("Cargo local dependency: {path} -> {origin} [{name}] -> {target_manifest}; library entry only, symbol exports and cfg not verified")))
    }
    pub fn context(&self, from: &str) -> (Option<String>, Vec<String>) {
        self.nearest(from)
            .map_or((None, Vec::new()), |(path, manifest)| {
                (Some(path.clone()), manifest.diagnostics.clone())
            })
    }
    pub fn resolve_in(
        &self,
        module: &str,
        manifest_path: &str,
        scope: &[String],
        kind: &str,
        paths: &HashSet<String>,
    ) -> Resolution {
        let fail = |message: &str| Resolution {
            target: None,
            method: message.into(),
        };
        if !scope.is_empty() && !module.starts_with("::") {
            return fail("Unqualified dependency in inline scope may be shadowed; use an absolute ::crate path");
        }
        let Some((path, manifest)) = self.manifests.get_key_value(manifest_path) else {
            return fail("No local Cargo manifest");
        };
        let alias = module
            .trim_start_matches("::")
            .split("::")
            .next()
            .unwrap_or("")
            .trim_start_matches("r#");
        let edition = if manifest.edition.as_deref() == Some("workspace") {
            self.workspace(path, manifest)
                .ok()
                .and_then(|(_, w)| w.workspace_edition.as_deref())
        } else {
            manifest.edition.as_deref()
        };
        let library_name = manifest
            .library_name
            .as_ref()
            .or(manifest.package.as_ref())
            .map(|n| n.replace('-', "_"));
        if kind != "lib"
            && library_name.as_deref() == Some(alias)
            && matches!(edition, Some("2018" | "2021" | "2024"))
        {
            if self
                .resolved
                .get(path)
                .is_some_and(|deps| deps.contains_key(alias))
            {
                return fail("Package library name conflicts with a dependency alias");
            }
            if let Some(root) = manifest.library.as_ref().filter(|p| paths.contains(*p)) {
                return Resolution { target: Some(root.clone()), method: format!("Cargo {kind} uses its package library: {path}; library entry only, symbols not verified") };
            }
        }
        match self.resolved.get(path).and_then(|deps| deps.get(alias)) {
            Some(resolution) => Resolution { target: resolution.target.clone(), method: resolution.method.clone() },
            None => fail("No supported normal Cargo dependency matches this import; local names and reexports are not indexed"),
        }
    }
}
