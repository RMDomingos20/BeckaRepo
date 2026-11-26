use beckarepo_core::{AnalysisRequest, AnalysisResult};

#[test]
fn javascript_fixtures_round_trip_through_rust() {
    let request: AnalysisRequest = serde_json::from_str(include_str!(
        "../../../tests/fixtures/analysis-request.json"
    ))
    .unwrap();
    request.validate().unwrap();
    let source = include_str!("../../../tests/fixtures/analysis-result.json");
    let result: AnalysisResult = serde_json::from_str(source).unwrap();
    result.validate().unwrap();
    let mut serialized = serde_json::to_value(&result).unwrap();
    serialized.as_object_mut().unwrap().remove("packages");
    // Legacy v1 payloads remain readable; additive F5 defaults are serialized explicitly.
    for node in serialized["nodes"].as_array_mut().unwrap() {
        node.as_object_mut().unwrap().remove("parsing");
    }
    for edge in serialized["edges"].as_array_mut().unwrap() {
        edge.as_object_mut().unwrap().remove("evidence");
    }
    assert_eq!(
        serialized,
        serde_json::from_str::<serde_json::Value>(source).unwrap()
    );
    assert!(result.nodes.iter().all(|n| n.parsing.targets.is_empty()));
    assert!(result.edges.iter().all(|e| e.evidence.is_none()));
}

#[test]
fn rejects_invalid_paths_and_versions() {
    let mut request: AnalysisRequest = serde_json::from_str(include_str!(
        "../../../tests/fixtures/analysis-request.json"
    ))
    .unwrap();
    for path in [
        "../main.js",
        "/main.js",
        "C:/main.js",
        "src\\main.js",
        "src//main.js",
    ] {
        request.files[0].path = path.to_owned();
        assert!(request.validate().is_err());
    }
    request.files.clear();
    request.schema_version = 2;
    assert!(request.validate().is_err());
}
