//! On-demand, bounded intra-file symbols. IDs are revision-scoped, never persistent note anchors.
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    time::{Duration, Instant},
};
use tree_sitter::{Node, ParseOptions, Parser};
pub const VERSION: &str = "symbols-v1/decisions-v1";
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub version: &'static str,
    pub path: String,
    pub revision: String,
    pub status: String,
    pub symbols: Vec<Symbol>,
    pub calls: Vec<Call>,
    pub diagnostics: Vec<String>,
    pub omitted: usize,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Symbol {
    pub id: String,
    pub name: String,
    pub qualified_name: String,
    pub kind: String,
    pub start_byte: usize,
    pub end_byte: usize,
    pub line: usize,
    pub end_line: usize,
    pub parent: Option<String>,
    pub complexity: Option<usize>,
    pub decisions: Vec<Decision>,
    pub decisions_omitted: usize,
    pub incoming: usize,
    pub exported: bool,
    pub entrypoint: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub rule: String,
    pub points: usize,
    pub line: usize,
    pub start_byte: usize,
    pub end_byte: usize,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Call {
    pub source: Option<String>,
    pub target: Option<String>,
    pub expression: String,
    pub line: usize,
    pub start_byte: usize,
    pub end_byte: usize,
    pub resolution: String,
}
struct Definition {
    index: usize,
    scope: Vec<usize>,
    callable: bool,
}
struct PendingCall {
    source: Option<usize>,
    scope: Vec<usize>,
    name: Option<String>,
    expression: String,
    line: usize,
    start: usize,
    end: usize,
}
fn text<'a>(node: Node, source: &'a str) -> &'a str {
    source.get(node.byte_range()).unwrap_or("")
}
fn function(kind: &str) -> bool {
    matches!(
        kind,
        "function_declaration"
            | "generator_function_declaration"
            | "function_expression"
            | "generator_function"
            | "arrow_function"
            | "method_definition"
            | "function_item"
    )
}
fn container(kind: &str) -> bool {
    matches!(
        kind,
        "class_declaration"
            | "abstract_class_declaration"
            | "interface_declaration"
            | "enum_declaration"
            | "struct_item"
            | "enum_item"
            | "trait_item"
            | "mod_item"
            | "impl_item"
            | "type_alias_declaration"
            | "type_item"
    )
}
fn scope(kind: &str) -> bool {
    function(kind)
        || matches!(
            kind,
            "program"
                | "source_file"
                | "statement_block"
                | "block"
                | "class_body"
                | "declaration_list"
        )
}
fn name(node: Node, source: &str) -> Option<String> {
    let named = node.child_by_field_name("name").or_else(|| {
        if node.kind() == "impl_item" {
            node.child_by_field_name("type")
        } else {
            None
        }
    });
    if let Some(n) = named {
        return Some(text(n, source).chars().take(160).collect());
    }
    if function(node.kind()) {
        if let Some(p) = node.parent().filter(|p| p.kind() == "variable_declarator") {
            if let Some(n) = p
                .child_by_field_name("name")
                .filter(|n| n.kind() == "identifier")
            {
                return Some(text(n, source).chars().take(160).collect());
            }
        }
        return Some(format!(
            "<anonymous@{}:{}>",
            node.start_position().row + 1,
            node.start_position().column + 1
        ));
    }
    None
}
fn exported(node: Node, source: &str) -> bool {
    let mut cursor = node.walk();
    node.named_children(&mut cursor)
        .any(|n| n.kind() == "visibility_modifier" && text(n, source).starts_with("pub"))
        || {
            let mut ancestor = node.parent();
            let mut found = false;
            for _ in 0..4 {
                let Some(parent) = ancestor else {
                    break;
                };
                if parent.kind() == "export_statement" {
                    found = true;
                    break;
                }
                if !matches!(
                    parent.kind(),
                    "variable_declarator" | "lexical_declaration" | "variable_declaration"
                ) {
                    break;
                }
                ancestor = parent.parent();
            }
            found
        }
}
fn decision(node: Node, source: &str) -> Option<Decision> {
    let (rule, points) = match node.kind() {
        "if_statement" | "if_expression" => ("if", 1),
        "for_statement" | "for_in_statement" | "for_expression" => ("for", 1),
        "while_statement" | "do_statement" | "while_expression" => ("loop-condition", 1),
        "catch_clause" => ("catch", 1),
        "ternary_expression" => ("conditional", 1),
        "switch_case" => ("switch-case", 1),
        "try_expression" => ("rust-question-mark", 1),
        "match_expression" => {
            let body = node.child_by_field_name("body")?;
            let mut c = body.walk();
            let count = body
                .named_children(&mut c)
                .filter(|n| n.kind() == "match_arm")
                .count();
            ("match-alternatives", count.saturating_sub(1))
        }
        "binary_expression" => {
            let op = node.child_by_field_name("operator")?;
            if !matches!(text(op, source), "&&" | "||") {
                return None;
            }
            ("short-circuit", 1)
        }
        _ => return None,
    };
    (points > 0).then(|| Decision {
        rule: rule.into(),
        points,
        line: node.start_position().row + 1,
        start_byte: node.start_byte(),
        end_byte: node.end_byte(),
    })
}
impl Report {
    fn diagnostic(&mut self, message: impl Into<String>) {
        if self.diagnostics.len() < 32 {
            self.diagnostics.push(message.into());
        } else {
            self.omitted += 1;
        }
    }
}
pub fn analyze(
    path: &str,
    revision: &str,
    source: &str,
    mut check: impl FnMut() -> Result<(), String>,
) -> Result<Report, String> {
    let mut out = Report {
        version: VERSION,
        path: path.into(),
        revision: revision.into(),
        status: "ready".into(),
        symbols: Vec::new(),
        calls: Vec::new(),
        diagnostics: Vec::new(),
        omitted: 0,
    };
    if source.len() as u64 >= crate::policy::MAX_CONTENT_BYTES {
        return Err("Symbol source exceeds 500 KiB".into());
    }
    let extension = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    let ext = extension.as_str();
    let rust = ext == "rs";
    let grammar = match ext {
        "rs" => tree_sitter_rust::LANGUAGE,
        "js" | "jsx" | "mjs" | "cjs" => tree_sitter_javascript::LANGUAGE,
        "ts" | "mts" | "cts" => tree_sitter_typescript::LANGUAGE_TYPESCRIPT,
        "tsx" => tree_sitter_typescript::LANGUAGE_TSX,
        _ => {
            out.status = "unsupported".into();
            out.diagnostic("Symbols are supported for JS/TS/JSX/TSX/Rust only");
            return Ok(out);
        }
    };
    check()?;
    let start = Instant::now();
    let mut parser = Parser::new();
    parser
        .set_language(&grammar.into())
        .map_err(|e| e.to_string())?;
    let mut timeout = |_: &tree_sitter::ParseState| start.elapsed() > Duration::from_millis(250);
    let Some(tree) = parser.parse_with_options(
        &mut |offset, _| &source.as_bytes()[offset..],
        None,
        Some(ParseOptions::new().progress_callback(&mut timeout)),
    ) else {
        out.status = "partial".into();
        out.diagnostic("Symbol parsing interrupted after 250 ms");
        return Ok(out);
    };
    let syntax_error = tree.root_node().has_error();
    if syntax_error {
        out.status = "partial".into();
        out.diagnostic(
            "Syntax errors: symbols/complexity may be incomplete; calls are not resolved",
        );
    }
    let mut definitions = HashMap::<String, Vec<Definition>>::new();
    let mut blocked = HashSet::<String>::new();
    let mut pending = Vec::<PendingCall>::new();
    let mut stack = vec![(
        tree.root_node(),
        Vec::<usize>::new(),
        None::<usize>,
        None::<usize>,
    )];
    let mut visited = 0usize;
    while let Some((node, mut lexical, mut owner, mut function_owner)) = stack.pop() {
        visited += 1;
        if visited % 128 == 0 {
            check()?;
        }
        if start.elapsed() > Duration::from_millis(750)
            || out.symbols.len() >= 1024
            || pending.len() >= 2048
            || lexical.len() > 64
        {
            out.status = "partial".into();
            out.diagnostic(
                "Symbol extraction limit reached: 750 ms / 1024 symbols / 2048 calls / 64 scopes",
            );
            break;
        }
        let kind = node.kind();
        if matches!(
            kind,
            "comment"
                | "line_comment"
                | "block_comment"
                | "string"
                | "string_literal"
                | "raw_string_literal"
                | "token_tree"
        ) {
            continue;
        }
        // Reject shadowing conservatively across the file, including assignments, parameters and imports.
        if matches!(
            kind,
            "formal_parameters"
                | "parameters"
                | "variable_declarator"
                | "let_declaration"
                | "assignment_expression"
                | "augmented_assignment_expression"
                | "import_clause"
                | "use_declaration"
        ) {
            let binding = if kind == "variable_declarator" {
                node.child_by_field_name("name")
            } else if kind == "let_declaration" {
                node.child_by_field_name("pattern")
            } else if kind.ends_with("assignment_expression") {
                node.child_by_field_name("left")
            } else {
                Some(node)
            };
            if let Some(binding) = binding {
                let mut names = vec![binding];
                while let Some(n) = names.pop() {
                    if matches!(
                        n.kind(),
                        "identifier" | "shorthand_property_identifier_pattern"
                    ) {
                        blocked.insert(text(n, source).trim_start_matches("r#").to_owned());
                    }
                    let mut c = n.walk();
                    names.extend(n.named_children(&mut c));
                }
            }
        }
        if function(kind) || container(kind) {
            if let Some(symbol_name) = name(node, source) {
                let index = out.symbols.len();
                let qualified = owner
                    .map(|i| format!("{}::{symbol_name}", out.symbols[i].qualified_name))
                    .unwrap_or(symbol_name.clone());
                let symbol_id = serde_json::to_string(&(
                    path,
                    revision,
                    VERSION,
                    &qualified,
                    node.start_byte(),
                    node.end_byte(),
                ))
                .map_err(|e| e.to_string())?;
                let callable = matches!(
                    kind,
                    "function_declaration" | "generator_function_declaration" | "function_item"
                ) && !node.parent().is_some_and(|n| {
                    n.parent()
                        .is_some_and(|p| matches!(p.kind(), "impl_item" | "trait_item"))
                });
                definitions
                    .entry(symbol_name.trim_start_matches("r#").into())
                    .or_default()
                    .push(Definition {
                        index,
                        scope: lexical.clone(),
                        callable,
                    });
                let parent_id = owner.map(|i| out.symbols[i].id.clone());
                out.symbols.push(Symbol {
                    id: symbol_id,
                    name: symbol_name.clone(),
                    qualified_name: qualified,
                    kind: kind.into(),
                    start_byte: node.start_byte(),
                    end_byte: node.end_byte(),
                    line: node.start_position().row + 1,
                    end_line: node.end_position().row + 1,
                    parent: parent_id,
                    complexity: function(kind).then_some(1),
                    decisions: Vec::new(),
                    decisions_omitted: 0,
                    incoming: 0,
                    exported: exported(node, source),
                    entrypoint: rust && symbol_name == "main" && lexical.len() == 1,
                });
                owner = Some(index);
                if function(kind) {
                    function_owner = Some(index);
                } else {
                    function_owner = None;
                }
            }
        }
        if scope(kind) {
            lexical.push(node.id());
        }
        if let Some(index) = function_owner {
            if let Some(d) = decision(node, source) {
                *out.symbols[index].complexity.as_mut().expect("function") += d.points;
                if out.symbols[index].decisions.len() < 128 {
                    out.symbols[index].decisions.push(d);
                } else {
                    out.symbols[index].decisions_omitted += 1;
                }
            }
        }
        if kind == "call_expression" {
            if let Some(callee) = node.child_by_field_name("function") {
                pending.push(PendingCall {
                    source: function_owner,
                    scope: lexical.clone(),
                    name: (callee.kind() == "identifier")
                        .then(|| text(callee, source).trim_start_matches("r#").to_owned()),
                    expression: text(callee, source).chars().take(180).collect(),
                    line: node.start_position().row + 1,
                    start: node.start_byte(),
                    end: node.end_byte(),
                });
            }
        }
        let mut cursor = node.walk();
        let children: Vec<_> = node.named_children(&mut cursor).collect();
        for child in children.into_iter().rev() {
            stack.push((child, lexical.clone(), owner, function_owner));
        }
    }
    check()?;
    for call in pending {
        let candidates: Vec<_> = call
            .name
            .as_ref()
            .filter(|n| !blocked.contains(*n))
            .and_then(|n| definitions.get(n))
            .into_iter()
            .flatten()
            .filter(|d| d.callable && call.scope.starts_with(&d.scope))
            .collect();
        let target = if out.status == "ready" && candidates.len() == 1 {
            Some(candidates[0].index)
        } else {
            None
        };
        if let Some(i) = target {
            out.symbols[i].incoming += 1;
        }
        out.calls.push(Call {
            source: call.source.map(|i| out.symbols[i].id.clone()),
            target: target.map(|i| out.symbols[i].id.clone()),
            expression: call.expression,
            line: call.line,
            start_byte: call.start,
            end_byte: call.end,
            resolution: if target.is_some() {
                "unique lexical function in this file; no detected binding/assignment shadowing"
            } else {
                "unresolved: external/member/dynamic/shadowed/ambiguous call or partial coverage"
            }
            .into(),
        });
    }
    if out.calls.iter().any(|c| c.target.is_none()) {
        out.diagnostic("Unresolved calls are listed as evidence, without target edges. Macros, imports, member dispatch and cross-file symbol resolution are outside this pilot.");
    }
    out.diagnostic("Zero known incoming calls is a hypothesis within this file only, never proof of unused code. Exports, entrypoints, callbacks and external references require review.");
    out.diagnostic("Source-level lexical analysis only: cfg/features, macros, runtime mutation and compiler type resolution are not evaluated.");
    if serde_json::to_vec(&out).map_err(|e| e.to_string())?.len() > 2 * 1024 * 1024 {
        return Err("Symbol report exceeds 2 MiB".into());
    }
    Ok(out)
}
