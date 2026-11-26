use std::{
    io::Write,
    process::{Command, Stdio},
};

#[test]
fn f0_cli_json_contract_and_rejected_inputs() {
    for (input, accepted) in [
        (
            r#"{"schemaVersion":1,"files":[{"path":"a.js","name":"a.js","size":0,"content":""}]}"#,
            true,
        ),
        (r#"{"schemaVersion":999,"files":[]}"#, false),
        (
            r#"{"schemaVersion":1,"files":[{"path":"../x","name":"x","size":0}]}"#,
            false,
        ),
        ("not json", false),
    ] {
        let mut child = Command::new(env!("CARGO_BIN_EXE_beckarepo-cli"))
            .arg("--json")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(input.as_bytes())
            .unwrap();
        let output = child.wait_with_output().unwrap();
        assert_eq!(output.status.success(), accepted);
        if accepted {
            let graph: beckarepo_core::AnalysisResult =
                serde_json::from_slice(&output.stdout).unwrap();
            graph.validate().unwrap();
            assert_eq!(graph.nodes.len(), 1);
        } else {
            assert!(output.stdout.is_empty());
            assert!(!output.stderr.is_empty());
        }
    }
}

#[test]
fn f0_file_count_limit_accepts_boundary_and_rejects_overflow() {
    use beckarepo_core::{policy::MAX_FILES, AnalysisRequest, RepositoryFile};
    let mut request = AnalysisRequest {
        schema_version: 1,
        files: (0..MAX_FILES)
            .map(|i| {
                let path = format!("{i}.txt");
                RepositoryFile {
                    name: path.clone(),
                    path,
                    size: 0,
                    content: None,
                }
            })
            .collect(),
    };
    request.validate().unwrap();
    request.files.push(RepositoryFile {
        path: "overflow.txt".into(),
        name: "overflow.txt".into(),
        size: 0,
        content: None,
    });
    assert_eq!(
        request.validate().unwrap_err(),
        "Analysis exceeds the file count limit"
    );
}
