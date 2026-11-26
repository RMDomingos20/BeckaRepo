//! Bounded module declarations linked from Cargo target roots. Sources and ASTs are not retained.
use crate::{
    cargo_resolution::Target,
    syntax,
    web_resolution::{parent, relative, Resolution},
};
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Default)]
struct Summary {
    modules: Vec<syntax::ModuleDeclaration>,
}
#[derive(Clone)]
struct Context {
    target: usize,
    module: Vec<String>,
}
struct Tree {
    target: Target,
    modules: BTreeMap<Vec<String>, Option<String>>,
}
#[derive(Default)]
pub struct RustModules {
    summaries: HashMap<String, Summary>,
    bytes: usize,
    trees: Vec<Tree>,
    contexts: HashMap<String, Vec<Context>>,
}
fn clean(parts: &[String]) -> Vec<String> {
    parts
        .iter()
        .map(|p| p.trim_start_matches("r#").to_owned())
        .collect()
}
fn failure(message: &str) -> Resolution {
    Resolution {
        target: None,
        method: message.into(),
    }
}

impl RustModules {
    pub fn add(&mut self, path: &str, source: &str) -> Result<(), String> {
        let Some(parsed) = syntax::parse("rs", source) else {
            return Ok(());
        };
        if parsed.report.engine != "tree-sitter" {
            return Ok(());
        }
        let mut summary = Summary {
            modules: parsed.modules,
        };
        for module in &mut summary.modules {
            module.scope = clean(&module.scope);
        }
        // Parents precede children; source order otherwise remains stable.
        summary.modules.sort_by_key(|m| m.scope.len());
        self.bytes += path.len()
            + summary
                .modules
                .iter()
                .map(|m| {
                    m.scope.iter().map(|s| s.len() + 24).sum::<usize>()
                        + m.path.as_ref().map_or(0, String::len)
                        + 48
                })
                .sum::<usize>();
        if self.bytes > 32 * 1024 * 1024 {
            return Err("Rust module declarations exceed 32 MiB".into());
        }
        self.summaries.insert(path.into(), summary);
        Ok(())
    }
    pub fn finish(&mut self, targets: Vec<Target>, paths: &HashSet<String>) -> Result<(), String> {
        self.trees.clear();
        self.contexts.clear();
        let mut entries = 0usize;
        let mut bytes = 0usize;
        for target in targets {
            let id = self.trees.len();
            let mut tree = Tree {
                target,
                modules: BTreeMap::new(),
            };
            let mut pending = vec![(tree.target.root.clone(), Vec::<String>::new(), true)];
            let mut visited = HashSet::new();
            while let Some((file, module, root)) = pending.pop() {
                if !visited.insert((file.clone(), module.clone())) {
                    continue;
                }
                if module.len() > 64 {
                    return Err("Rust module tree exceeds 64 levels".into());
                }
                entries += 1;
                bytes += file.len() * 3 + module.iter().map(|s| s.len() + 24).sum::<usize>() * 3;
                if entries > 100_000 || bytes > 32 * 1024 * 1024 {
                    return Err("Rust target/module index exceeds 100000 entries or 32 MiB".into());
                }
                tree.modules
                    .entry(module.clone())
                    .or_insert_with(|| Some(file.clone()));
                self.contexts
                    .entry(file.clone())
                    .or_default()
                    .push(Context {
                        target: id,
                        module: module.clone(),
                    });
                let Some(summary) = self.summaries.get(&file) else {
                    continue;
                };
                // Explicit #[path] files own their containing directory, just like roots.
                let dir = if root || file.ends_with("/mod.rs") || file == "mod.rs" {
                    parent(&file)
                } else {
                    file.trim_end_matches(".rs")
                };
                let mut inline_dirs =
                    BTreeMap::from([(Vec::<String>::new(), Some(dir.to_owned()))]);
                let mut counts = HashMap::new();
                for declaration in &summary.modules {
                    *counts.entry(&declaration.scope).or_insert(0) += 1;
                }
                for declaration in &summary.modules {
                    let scope = &declaration.scope;
                    let mut logical = module.clone();
                    logical.extend(scope.clone());
                    if logical.len() > 64 {
                        return Err("Rust module tree exceeds 64 levels".into());
                    }
                    let parent_scope = &scope[..scope.len() - 1];
                    let base_dir = inline_dirs.get(parent_scope).and_then(|d| d.as_deref());
                    let base = base_dir.and_then(|base_dir| {
                        if declaration.blocked || counts[scope] != 1 {
                            return None;
                        }
                        if let Some(path) = &declaration.path {
                            relative(
                                if parent_scope.is_empty() {
                                    parent(&file)
                                } else {
                                    base_dir
                                },
                                path,
                            )
                        } else {
                            relative(base_dir, scope.last().expect("named module"))
                        }
                    });
                    let candidates: Vec<_> = if declaration.inline {
                        base.as_ref()
                            .map(|_| vec![file.clone()])
                            .unwrap_or_default()
                    } else if let Some(base) = &base {
                        let possible = if declaration.path.is_some() {
                            vec![base.clone()]
                        } else {
                            vec![format!("{base}.rs"), format!("{base}/mod.rs")]
                        };
                        possible
                            .into_iter()
                            .filter(|p| p.ends_with(".rs") && paths.contains(p))
                            .collect()
                    } else {
                        Vec::new()
                    };
                    entries += 1;
                    bytes += logical.iter().map(|s| s.len() + 24).sum::<usize>()
                        + candidates.iter().map(String::len).sum::<usize>()
                        + base.as_ref().map_or(0, String::len);
                    if entries > 100_000 || bytes > 32 * 1024 * 1024 {
                        return Err(
                            "Rust target/module index exceeds 100000 entries or 32 MiB".into()
                        );
                    }
                    // A path back to an ancestor must not grow an unbounded recursive tree.
                    let recursive = !declaration.inline
                        && candidates.first().is_some_and(|candidate| {
                            (0..logical.len()).any(|n| {
                                tree.modules.get(&logical[..n]).and_then(|p| p.as_ref())
                                    == Some(candidate)
                            })
                        });
                    if tree.modules.contains_key(&logical) || candidates.len() != 1 || recursive {
                        tree.modules.insert(logical, None);
                        if declaration.inline {
                            inline_dirs.insert(scope.clone(), None);
                        }
                    } else {
                        tree.modules
                            .insert(logical.clone(), Some(candidates[0].clone()));
                        if declaration.inline {
                            inline_dirs.insert(scope.clone(), base);
                        } else {
                            pending.push((
                                candidates[0].clone(),
                                logical,
                                declaration.path.is_some(),
                            ));
                        }
                    }
                }
            }
            self.trees.push(tree);
        }
        Ok(())
    }
    pub fn targets(&self, file: &str) -> (Vec<syntax::TargetContext>, usize) {
        let mut result = Vec::new();
        let mut omitted = 0;
        let mut bytes = 0;
        if let Some(contexts) = self.contexts.get(file) {
            for context in contexts {
                let target = &self.trees[context.target].target;
                let size = target.manifest.len()
                    + target.name.len()
                    + target.kind.len()
                    + target.root.len()
                    + context.module.iter().map(|p| p.len() + 2).sum::<usize>();
                if result.len() == 16 || bytes + size > 32 * 1024 {
                    omitted += 1;
                    continue;
                }
                bytes += size;
                result.push(syntax::TargetContext {
                    manifest: target.manifest.clone(),
                    name: target.name.clone(),
                    kind: target.kind.clone(),
                    root: target.root.clone(),
                    module: context.module.join("::"),
                });
            }
        }
        (result, omitted)
    }
    pub fn owners(&self, file: &str) -> Result<Vec<(&str, &str)>, String> {
        let contexts = self
            .contexts
            .get(file)
            .ok_or("Source is not linked to a supported Cargo target")?;
        let mut owners = Vec::new();
        for context in contexts {
            let tree = &self.trees[context.target];
            if (0..=context.module.len()).any(|n| {
                tree.modules
                    .get(&context.module[..n])
                    .is_some_and(Option::is_none)
            }) {
                return Err("Source belongs to an ambiguous module declaration".into());
            }
            let target = &tree.target;
            if target.kind == "build" {
                return Err(
                    "Source belongs to a build script; normal dependencies are not used".into(),
                );
            }
            let owner = (target.manifest.as_str(), target.kind.as_str());
            if !owners.contains(&owner) {
                owners.push(owner);
            }
        }
        Ok(owners)
    }
    pub fn resolve(
        &self,
        file: &str,
        scope: &[String],
        module: &str,
        declaration: bool,
    ) -> Resolution {
        let Some(contexts) = self.contexts.get(file) else {
            return failure("Source is not linked to a supported Cargo target");
        };
        let mut chosen = None;
        for context in contexts {
            let tree = &self.trees[context.target];
            if (0..=context.module.len()).any(|n| {
                tree.modules
                    .get(&context.module[..n])
                    .is_some_and(Option::is_none)
            }) {
                return failure("Source belongs to an ambiguous module declaration");
            }
            let mut logical = context.module.clone();
            logical.extend(clean(scope));
            let mut parts = module.split("::");
            if !declaration {
                match parts.next() {
                    Some("crate") => logical.clear(),
                    Some("self") => {}
                    Some("super") => {
                        if logical.pop().is_none() {
                            return failure("super escapes the Cargo crate root");
                        }
                    }
                    _ => return failure("Unsupported module prefix"),
                }
            }
            for part in parts {
                if part == "super" {
                    if logical.pop().is_none() {
                        return failure("super escapes the Cargo crate root");
                    }
                } else {
                    logical.push(part.trim_start_matches("r#").into());
                }
            }
            // An unresolved ancestor must not be bypassed by a descendant discovered earlier.
            for count in 0..=logical.len() {
                if tree
                    .modules
                    .get(&logical[..count])
                    .is_some_and(Option::is_none)
                {
                    return failure(
                        "Declared Rust module is missing, ambiguous, outside the inventory or recursive in a Cargo target",
                    );
                }
            }
            let mut found = tree.modules.get(&logical);
            if !declaration {
                while found.is_none() && !logical.is_empty() {
                    logical.pop();
                    found = tree.modules.get(&logical);
                }
            }
            let Some(Some(target)) = found else {
                return failure("Module is not declared in every Cargo target for this source");
            };
            if chosen.as_ref().is_some_and(|prior| prior != target) {
                return failure("Cargo targets resolve this import to different files");
            }
            chosen = Some(target.clone());
        }
        Resolution { target: chosen, method: format!("Cargo module declarations; agreement across {} target context(s); symbol exports and cfg not verified", contexts.len()) }
    }
}
