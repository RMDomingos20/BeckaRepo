use super::*;
fn session(names: &[&str], edges: &[(&str, &str, &str)]) -> Session {
    let root = crate::validation_support::folder("metrics");
    for name in names {
        std::fs::write(root.join(name), "").unwrap();
    }
    let mut s = crate::validation_support::session(&root);
    s.snapshot.graph.edges = edges
        .iter()
        .enumerate()
        .map(|(i, (a, b, k))| beckarepo_core::Edge {
            id: i.to_string(),
            source: (*a).into(),
            target: (*b).into(),
            kind: (*k).into(),
            detail: String::new(),
            bidirectional: false,
            evidence: None,
        })
        .collect();
    s
}
fn report(s: &Session, inheritance: bool, samples: usize) -> Report {
    let flag = AtomicBool::new(false);
    calculate(
        s,
        inheritance,
        samples,
        &Budget {
            session: s,
            cancelled: &flag,
            start: Instant::now(),
        },
    )
    .unwrap()
}
#[test]
fn f4_chain_matches_reference_degrees_rank_and_brandes() {
    let s = session(
        &["a.rs", "b.rs", "c.rs"],
        &[("a.rs", "b.rs", "import"), ("b.rs", "c.rs", "import")],
    );
    let r = report(&s, false, 32);
    assert_eq!(r.total_cycles, 0);
    assert!(r.betweenness_exact);
    let a = &r.rows[0];
    let b = &r.rows[1];
    let c = &r.rows[2];
    assert_eq!(
        (
            a.in_degree,
            a.out_degree,
            b.in_degree,
            b.out_degree,
            c.in_degree,
            c.out_degree
        ),
        (0, 1, 1, 1, 1, 0)
    );
    assert!((b.betweenness.unwrap() - 0.5).abs() < 1e-10);
    assert_eq!(a.betweenness, Some(0.0));
    assert!((a.page_rank - 0.18441678).abs() < 1e-6);
    assert!((b.page_rank - 0.34117105).abs() < 1e-6);
    assert!((c.page_rank - 0.47441217).abs() < 1e-6);
    assert!((r.rows.iter().map(|r| r.page_rank).sum::<f64>() - 1.0).abs() < 1e-8);
}
#[test]
fn f4_cycles_self_loops_and_projection() {
    let s = session(
        &["a.rs", "b.rs", "c.rs"],
        &[
            ("a.rs", "b.rs", "import"),
            ("b.rs", "a.rs", "require"),
            ("c.rs", "c.rs", "re-export"),
            ("b.rs", "c.rs", "sibling"),
            ("c.rs", "a.rs", "prototype-parent"),
        ],
    );
    let r = report(&s, false, 32);
    assert_eq!(r.total_cycles, 2);
    assert_eq!(r.edges, 3);
    for cycle in r.cycles {
        assert_eq!(cycle.witness.first(), cycle.witness.last());
    }
    assert_eq!(report(&s, true, 0).edges, 4);
}
#[test]
fn f4_empty_cancelled_and_sampled_graphs() {
    let empty = session(&[], &[]);
    assert!(report(&empty, false, 32).rows.is_empty());
    let flag = AtomicBool::new(true);
    assert!(calculate(
        &empty,
        false,
        32,
        &Budget {
            session: &empty,
            cancelled: &flag,
            start: Instant::now()
        }
    )
    .is_err());
    let names: Vec<_> = (0..300).map(|i| format!("f{i:03}.rs")).collect();
    let links: Vec<_> = names
        .windows(2)
        .map(|p| (p[0].as_str(), p[1].as_str(), "import"))
        .collect();
    let refs: Vec<_> = names.iter().map(String::as_str).collect();
    let s = session(&refs, &links);
    let r = report(&s, false, 8);
    assert!(!r.betweenness_exact);
    assert_eq!(r.sources.len(), 8);
    assert!(r.rows.iter().all(|r| r.betweenness.unwrap().is_finite()));
}
