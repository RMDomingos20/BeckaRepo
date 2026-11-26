use std::{
    collections::{hash_map::DefaultHasher, BTreeMap},
    hash::{Hash, Hasher},
    path::Path,
    time::Instant,
};

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let root = args
        .first()
        .ok_or("Usage: profile_scan <repository> [snapshot-output]")?;
    let start = Instant::now();
    let mut last = start;
    let mut phase = "scan";
    let mut phases = BTreeMap::<String, f64>::new();
    let snapshot = beckarepo_core::repository::scan(Path::new(root), |p| {
        if p.phase != phase {
            *phases.entry(phase.to_string()).or_default() += last.elapsed().as_secs_f64();
            eprintln!(
                "{phase}: {:.2}s cumulative={:.2}s",
                last.elapsed().as_secs_f64(),
                start.elapsed().as_secs_f64()
            );
            last = Instant::now();
            phase = p.phase;
        }
        Ok(())
    })?;
    *phases.entry(phase.to_string()).or_default() += last.elapsed().as_secs_f64();
    let scan_seconds = start.elapsed().as_secs_f64();
    let mut edges: Vec<_> = snapshot
        .graph
        .edges
        .iter()
        .map(|e| serde_json::to_string(e).unwrap())
        .collect();
    edges.sort();
    let mut hash = DefaultHasher::new();
    edges.hash(&mut hash);
    let serialize_start = Instant::now();
    let json = serde_json::to_vec(&snapshot).map_err(|e| e.to_string())?;
    let serialize_seconds = serialize_start.elapsed().as_secs_f64();
    if let Some(output) = args.get(1) {
        std::fs::write(output, &json).map_err(|e| e.to_string())?;
    }
    println!(
        "{}",
        serde_json::json!({"scanSeconds":scan_seconds,"phasesSeconds":phases,
        "serializeSeconds":serialize_seconds,"snapshotBytes":json.len(),"files":snapshot.files.len(),
        "edges":snapshot.graph.edges.len(),"edgeFingerprint":format!("{:016x}",hash.finish()),"warnings":snapshot.warnings.len(),
        "profile":"Use --release for installed-app performance; timings exclude IPC and WebView."})
    );
    Ok(())
}
