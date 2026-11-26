use beckarepo_core::symbols::{analyze, Report};
fn run(path: &str, source: &str) -> Report {
    analyze(path, "revision-1", source, || Ok(())).unwrap()
}
#[test]
fn javascript_decisions_nested_functions_and_lexical_calls() {
    let src="export function outer(x) { if (x && x.ok) { for(let i=0;i<2;i++) inner(); } function inner() { while(false) {} } return x ? 1 : 0; }\nouter({ok:true});";
    let r = run("main.js", src);
    assert_eq!(r.status, "ready");
    let outer = r.symbols.iter().find(|s| s.name == "outer").unwrap();
    let inner = r.symbols.iter().find(|s| s.name == "inner").unwrap();
    assert_eq!(outer.complexity, Some(5));
    assert_eq!(inner.complexity, Some(2));
    assert!(outer.exported);
    assert_eq!(inner.qualified_name, "outer::inner");
    assert_eq!(inner.parent.as_ref(), Some(&outer.id));
    assert_eq!(outer.incoming, 1);
    assert_eq!(inner.incoming, 1);
    assert_eq!(r.calls.iter().filter(|c| c.target.is_some()).count(), 2);
    assert_eq!(
        outer.decisions.iter().map(|d| d.points).sum::<usize>() + 1,
        5
    );
}
#[test]
fn rust_match_question_mark_and_recursion() {
    let src="pub fn calc(x: i32) -> Option<i32> { let v = Some(x)?; match v { 0 => Some(0), 1 => calc(0), _ => None } }\nfn main() { calc(2); }";
    let r = run("src/main.rs", src);
    let f = r.symbols.iter().find(|s| s.name == "calc").unwrap();
    assert_eq!(f.complexity, Some(4));
    assert_eq!(f.incoming, 2);
    assert!(f.exported);
    assert!(r.symbols.iter().any(|s| s.name == "main" && s.entrypoint));
    assert!(r
        .calls
        .iter()
        .any(|c| c.source.as_ref() == Some(&f.id) && c.target.as_ref() == Some(&f.id)));
    assert!(r
        .calls
        .iter()
        .any(|c| c.expression == "Some" && c.target.is_none()));
}
#[test]
fn shadowed_dynamic_and_cross_scope_calls_do_not_gain_edges() {
    for source in [
        "function f(){} function use(f){f();} f();",
        "function f(){} f = other; f();",
        "function outer(){function hidden(){} hidden();} hidden(); obj.method();",
    ] {
        let r = run("a.ts", source);
        if source.contains("outer") {
            assert_eq!(r.calls.iter().filter(|c| c.target.is_some()).count(), 1);
        } else {
            assert!(r.calls.iter().all(|c| c.target.is_none()));
        }
    }
    let r = run("a.rs", "fn f(){} fn g(){let f=||{}; f();}");
    assert!(r.calls.iter().all(|c| c.target.is_none()));
}
#[test]
fn unicode_ranges_and_revision_scoped_ids() {
    let source = "// 😀 comentário\nfn ação() { if true {} }";
    let a = run("a.rs", source);
    let b = analyze("a.rs", "revision-2", source, || Ok(())).unwrap();
    let s = &a.symbols[0];
    assert_eq!(
        &source[s.start_byte..s.end_byte],
        "fn ação() { if true {} }"
    );
    assert_eq!(s.line, 2);
    assert_ne!(s.id, b.symbols[0].id);
    assert_eq!(s.id, run("a.rs", source).symbols[0].id);
}
#[test]
fn macros_comments_and_string_contents_are_not_symbols_or_decisions() {
    let source="// fn fake(){}\nfn real(){ let s=\"if fake() {}\"; unknown!(fn injected(){ if true {} }); }";
    let r = run("a.rs", source);
    assert_eq!(r.symbols.len(), 1);
    assert_eq!(r.symbols[0].complexity, Some(1));
    assert!(r.calls.is_empty());
}
#[test]
fn typescript_classes_arrows_and_partial_syntax() {
    let r=run("a.tsx","interface Model { value: number; } class Box { method(x:number) { return x ? <b/> : <i/>; } } const render = () => <Box/>;");
    assert!(r
        .symbols
        .iter()
        .any(|s| s.name == "Model" && s.complexity.is_none()));
    assert!(r
        .symbols
        .iter()
        .any(|s| s.qualified_name == "Box::method" && s.complexity == Some(2)));
    assert!(r
        .symbols
        .iter()
        .any(|s| s.name == "render" && s.complexity == Some(1)));
    let r = run("a.js", "function fine(){} fine(); function broken( {");
    assert_eq!(r.status, "partial");
    assert!(r.calls.iter().all(|c| c.target.is_none()));
}
#[test]
fn unsupported_cancel_and_budgets_are_explicit() {
    assert_eq!(run("a.py", "def f(): pass").status, "unsupported");
    assert!(analyze("a.rs", "r", "fn f(){}", || Err("cancelled".into()))
        .unwrap_err()
        .contains("cancelled"));
    assert!(analyze("a.rs", "r", &"x".repeat(512000), || Ok(())).is_err());
    let source = (0..1100)
        .map(|i| format!("fn f{i}(){{}}\n"))
        .collect::<String>();
    let r = run("a.rs", &source);
    assert_eq!(r.status, "partial");
    assert!(r.symbols.len() <= 1024);
    assert!(!r.diagnostics.is_empty());
}
