//! Bounded syntax facts. Module resolution belongs to Index, not to the grammar.
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tree_sitter::{Node, ParseOptions, Parser};

pub const VERSION: &str = "syntax-v5/ts-0.25.10/js-0.25.0/ts-0.23.2/rs-0.24.2";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetContext {
    pub manifest: String,
    pub name: String,
    pub kind: String,
    pub root: String,
    pub module: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub name: String,
    pub alias: Option<String>,
    pub kind: String,
    pub start_byte: usize,
    pub end_byte: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub engine: String,
    pub start_byte: usize,
    pub end_byte: usize,
    pub line: usize,
    pub bindings: Vec<String>,
    #[serde(default)]
    pub resolution: Option<String>,
    #[serde(default)]
    pub symbols: Vec<Binding>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub engine: String,
    pub version: String,
    pub diagnostics: Vec<String>,
    pub omitted: usize,
    #[serde(default)]
    pub configuration: Option<String>,
    #[serde(default)]
    pub intra_file_imports: usize,
    #[serde(default)]
    pub targets: Vec<TargetContext>,
    #[serde(default)]
    pub targets_omitted: usize,
}
impl Report {
    pub fn diagnostic(&mut self, message: String) {
        if self.diagnostics.len() < 32 {
            self.diagnostics.push(message.chars().take(1024).collect());
        } else {
            self.omitted += 1;
        }
    }
}
pub struct Fact {
    pub module: String,
    pub kind: &'static str,
    pub scope: Vec<String>,
    pub evidence: Evidence,
}
pub struct Parsed {
    pub facts: Vec<Fact>,
    pub inline_modules: Vec<Vec<String>>,
    pub modules: Vec<ModuleDeclaration>,
    pub unsupported_inner_path: bool,
    pub report: Report,
}
// Compact facts only: no source text or syntax nodes survive extraction.
pub struct ModuleDeclaration {
    pub scope: Vec<String>,
    pub path: Option<String>,
    pub inline: bool,
    pub blocked: bool,
}
fn text<'a>(node: Node, source: &'a str) -> &'a str {
    source.get(node.byte_range()).unwrap_or("")
}
fn literal(node: Node, source: &str) -> Option<String> {
    if !["string", "string_literal"].contains(&node.kind()) {
        return None;
    }
    if node.has_error() {
        return None;
    }
    let raw = text(node, source);
    if raw.len() < 2 || raw.contains('\\') || raw.len() > 514 {
        return None;
    }
    Some(raw[1..raw.len() - 1].into())
}
fn rust_path_literal(node: Node, source: &str) -> Option<String> {
    let value = if node.kind() == "raw_string_literal" && !node.has_error() {
        let raw = text(node, source);
        let quote = raw.find('"')?;
        let prefix = raw.get(..quote)?;
        if !prefix.starts_with('r') || !prefix[1..].chars().all(|c| c == '#') {
            return None;
        }
        let suffix = format!("\"{}", &prefix[1..]);
        raw.get(quote + 1..)?.strip_suffix(&suffix)?.to_owned()
    } else {
        literal(node, source)?
    };
    (!value.is_empty() && value.len() <= 512 && !value.chars().any(char::is_control))
        .then_some(value)
}
fn attribute_parts<'tree, 'source>(
    item: Node<'tree>,
    source: &'source str,
) -> Option<(Node<'tree>, &'source str)> {
    let mut cursor = item.walk();
    let attribute = item
        .named_children(&mut cursor)
        .find(|n| n.kind() == "attribute")?;
    let mut cursor = attribute.walk();
    let name = attribute
        .named_children(&mut cursor)
        .find(|n| !matches!(n.kind(), "line_comment" | "block_comment"))?;
    Some((attribute, text(name, source)))
}
fn module_path(node: Node, source: &str) -> Result<Option<String>, String> {
    let mut sibling = node.prev_named_sibling();
    let mut path = None;
    while let Some(item) = sibling {
        sibling = item.prev_named_sibling();
        if matches!(item.kind(), "line_comment" | "block_comment") {
            continue;
        }
        if item.kind() != "attribute_item" {
            break;
        }
        let Some((attribute, name)) = attribute_parts(item, source) else {
            continue;
        };
        if name == "cfg_attr" {
            return Err("cfg_attr on Rust module is not evaluated; subtree unresolved".into());
        }
        if name != "path" {
            continue;
        }
        if path.is_some() {
            return Err("Conflicting Rust path attributes; subtree unresolved".into());
        }
        let value = attribute.child_by_field_name("value")
            .and_then(|n| rust_path_literal(n, source))
            .ok_or("Rust path requires a nonempty literal up to 512 bytes without escapes/control characters")?;
        if value.starts_with('/') || value.contains(['\\', ':', '\0']) {
            return Err("Rust path must be a relative portable path inside the inventory".into());
        }
        path = Some(value);
    }
    Ok(path)
}
fn evidence(node: Node, source: &str) -> Evidence {
    let mut bindings = Vec::new();
    let mut symbols = Vec::new();
    let mut stack = vec![node];
    while let Some(n) = stack.pop() {
        if [
            "import_specifier",
            "export_specifier",
            "namespace_import",
            "use_as_clause",
        ]
        .contains(&n.kind())
        {
            if bindings.len() < 16 && symbols.len() < 16 {
                bindings.push(text(n, source).chars().take(120).collect());
                let name = n
                    .child_by_field_name("name")
                    .or_else(|| n.child_by_field_name("path"));
                let alias = n.child_by_field_name("alias").or_else(|| {
                    if n.kind() == "namespace_import" {
                        n.named_child(0)
                    } else {
                        None
                    }
                });
                symbols.push(Binding {
                    name: name
                        .map(|v| text(v, source).chars().take(120).collect())
                        .unwrap_or_else(|| "*".into()),
                    alias: alias.map(|v| text(v, source).chars().take(120).collect()),
                    kind: n.kind().into(),
                    start_byte: n.start_byte(),
                    end_byte: n.end_byte(),
                });
            }
            continue;
        }
        if n.kind() == "identifier"
            && n.parent().is_some_and(|p| p.kind() == "import_clause")
            && symbols.len() < 16
        {
            symbols.push(Binding {
                name: "default".into(),
                alias: Some(text(n, source).chars().take(120).collect()),
                kind: "default_import".into(),
                start_byte: n.start_byte(),
                end_byte: n.end_byte(),
            });
        }
        if n != node
            && ![
                "import_clause",
                "named_imports",
                "export_clause",
                "use_list",
                "scoped_use_list",
            ]
            .contains(&n.kind())
        {
            continue;
        }
        let mut cursor = n.walk();
        stack.extend(n.named_children(&mut cursor));
    }
    Evidence {
        engine: "tree-sitter".into(),
        start_byte: node.start_byte(),
        end_byte: node.end_byte(),
        line: node.start_position().row + 1,
        bindings,
        resolution: None,
        symbols,
    }
}

pub fn parse(ext: &str, source: &str) -> Option<Parsed> {
    let language = match ext {
        "js" | "jsx" | "mjs" | "cjs" => tree_sitter_javascript::LANGUAGE,
        "ts" | "mts" | "cts" => tree_sitter_typescript::LANGUAGE_TYPESCRIPT,
        "tsx" => tree_sitter_typescript::LANGUAGE_TSX,
        "rs" => tree_sitter_rust::LANGUAGE,
        _ => return None,
    };
    let mut result = Parsed {
        facts: Vec::new(),
        inline_modules: Vec::new(),
        modules: Vec::new(),
        unsupported_inner_path: false,
        report: Report {
            engine: "tree-sitter".into(),
            version: VERSION.into(),
            ..Default::default()
        },
    };
    let mut parser = Parser::new();
    if parser.set_language(&language.into()).is_err() {
        result.report.engine = "regex-fallback".into();
        result
            .report
            .diagnostic("Grammar unavailable; regex fallback".into());
        return Some(result);
    }
    let start = Instant::now();
    let mut progress = |_: &tree_sitter::ParseState| start.elapsed() > Duration::from_millis(250);
    let tree = parser.parse_with_options(
        &mut |offset, _| &source.as_bytes()[offset..],
        None,
        Some(ParseOptions::new().progress_callback(&mut progress)),
    );
    let Some(tree) = tree else {
        result.report.engine = "regex-fallback".into();
        result
            .report
            .diagnostic("Parsing interrupted after 250 ms; regex fallback".into());
        return Some(result);
    };
    if tree.root_node().has_error() {
        result
            .report
            .diagnostic("Syntax errors detected; recovered dependencies may be incomplete".into());
    }
    let mut stack = vec![(tree.root_node(), std::sync::Arc::new(Vec::<String>::new()))];
    while let Some((node, scope)) = stack.pop() {
        if start.elapsed() > Duration::from_millis(500) || result.facts.len() >= 2048 {
            result.report.diagnostic(
                "Fact extraction limit reached (500 ms / 2048 facts); partial coverage".into(),
            );
            break;
        }
        if node.is_error() || node.is_missing() {
            result.report.diagnostic(format!(
                "Syntax error at line {}; dependencies may be incomplete",
                node.start_position().row + 1
            ));
        }
        if ext == "rs" && node.kind() == "inner_attribute_item" {
            let name = attribute_parts(node, source)
                .map(|(_, name)| name)
                .unwrap_or("");
            if matches!(name, "path" | "cfg_attr") {
                result.unsupported_inner_path = true;
                result.report.diagnostic(format!(
                    "Inner Rust {name} attribute at line {}; file module context not resolved",
                    node.start_position().row + 1
                ));
            }
        }
        // Do not interpret code-like text in comments, strings or macro token trees.
        if matches!(
            node.kind(),
            "comment"
                | "line_comment"
                | "block_comment"
                | "string"
                | "string_literal"
                | "template_string"
                | "token_tree"
        ) {
            continue;
        }
        if ext == "rs" && node.kind() == "mod_item" {
            let mut ancestor = node.parent();
            let mut block_scoped = false;
            while let Some(parent) = ancestor {
                if parent.kind() == "block" {
                    block_scoped = true;
                    break;
                }
                ancestor = parent.parent();
            }
            if block_scoped {
                result.report.diagnostic(format!(
                    "Block-scoped Rust module at line {}; subtree not indexed",
                    node.start_position().row + 1
                ));
                continue;
            }
            let path = module_path(node, source);
            if let Err(error) = &path {
                result
                    .report
                    .diagnostic(format!("{error} at line {}", node.start_position().row + 1));
            }
            if let Some(name) = node.child_by_field_name("name") {
                let mut nested = scope.as_ref().clone();
                nested.push(text(name, source).to_owned());
                if nested.len() > 32
                    || nested.iter().map(String::len).sum::<usize>() > 1024
                    || result.modules.len() >= 2048
                {
                    result.report.diagnostic(
                        "Module scope exceeds 32 levels / 1024 bytes / 2048 modules".into(),
                    );
                    continue;
                }
                result.modules.push(ModuleDeclaration {
                    scope: nested,
                    inline: node.child_by_field_name("body").is_some(),
                    blocked: path.is_err(),
                    path: path.as_ref().ok().cloned().flatten(),
                });
            }
            if path.is_err() {
                continue;
            }
            if let Some(body) = node.child_by_field_name("body") {
                if let Some(name) = node.child_by_field_name("name") {
                    let mut nested = scope.as_ref().clone();
                    nested.push(text(name, source).to_owned());
                    if nested.len() > 32
                        || nested.iter().map(String::len).sum::<usize>() > 1024
                        || result.inline_modules.len() >= 2048
                    {
                        result.report.diagnostic(
                            "Inline module scope exceeds 32 levels / 1024 bytes / 2048 modules"
                                .into(),
                        );
                        continue;
                    }
                    result.inline_modules.push(nested.clone());
                    stack.push((body, std::sync::Arc::new(nested)));
                }
                continue;
            }
        }
        let origin = if matches!(
            node.kind(),
            "import_statement"
                | "export_statement"
                | "call_expression"
                | "mod_item"
                | "use_declaration"
        ) {
            Some(evidence(node, source))
        } else {
            None
        };
        let mut add = |module: String, kind| {
            if module.len() <= 512 && result.facts.len() < 2048 {
                result.facts.push(Fact {
                    module,
                    kind,
                    scope: scope.as_ref().clone(),
                    evidence: origin.clone().expect("dependency node"),
                });
            } else if module.len() > 512 {
                result.report.diagnostic(format!(
                    "Module path exceeds 512 bytes at line {}; unresolved",
                    node.start_position().row + 1
                ));
            }
        };
        match node.kind() {
            "import_statement" | "export_statement" => {
                if let Some(value) = node.child_by_field_name("source") {
                    if let Some(module) = literal(value, source) {
                        add(
                            module,
                            if node.kind() == "export_statement" {
                                "re-export"
                            } else {
                                "import"
                            },
                        );
                    } else {
                        result.report.diagnostic(format!(
                            "Unsupported module literal at line {}",
                            node.start_position().row + 1
                        ));
                    }
                }
            }
            "call_expression" if ext != "rs" => {
                let function = node
                    .child_by_field_name("function")
                    .map(|n| text(n, source))
                    .unwrap_or("");
                if ["import", "require"].contains(&function) {
                    let arg = node
                        .child_by_field_name("arguments")
                        .and_then(|n| n.named_child(0));
                    if let Some(module) = arg.and_then(|n| literal(n, source)) {
                        add(module, "require");
                    } else {
                        result.report.diagnostic(format!(
                            "Dynamic module expression at line {}; unresolved",
                            node.start_position().row + 1
                        ));
                    }
                }
            }
            "mod_item" if node.child_by_field_name("body").is_none() => {
                if let Some(name) = node.child_by_field_name("name") {
                    add(text(name, source).into(), "rust-mod");
                }
            }
            "use_declaration" => {
                if let Some(arg) = node.child_by_field_name("argument") {
                    // Expand grouped use trees without treating comments or aliases as paths.
                    let mut pending = vec![(arg, String::new())];
                    while let Some((item, prefix)) = pending.pop() {
                        match item.kind() {
                            "scoped_use_list" => {
                                let path = item
                                    .child_by_field_name("path")
                                    .map(|n| text(n, source))
                                    .unwrap_or("");
                                if let Some(list) = item.child_by_field_name("list") {
                                    pending.push((list, format!("{prefix}{path}::")));
                                }
                            }
                            "use_list" => {
                                let mut cursor = item.walk();
                                for child in item.named_children(&mut cursor) {
                                    pending.push((child, prefix.clone()));
                                }
                            }
                            "use_as_clause" => {
                                if let Some(path) = item.child_by_field_name("path") {
                                    pending.push((path, prefix));
                                }
                            }
                            "identifier" | "scoped_identifier" | "self" | "crate" | "super"
                            | "use_wildcard" => add(
                                format!("{prefix}{}", text(item, source))
                                    .trim_end_matches("::*")
                                    .to_owned(),
                                "import",
                            ),
                            _ => {}
                        }
                    }
                }
            }
            _ => {}
        }
        let mut cursor = node.walk();
        stack.extend(
            node.named_children(&mut cursor)
                .map(|child| (child, scope.clone())),
        );
    }
    result.facts.sort_by_key(|fact| fact.evidence.start_byte);
    if result.unsupported_inner_path {
        for module in &mut result.modules {
            module.blocked = true;
        }
    }
    Some(result)
}
