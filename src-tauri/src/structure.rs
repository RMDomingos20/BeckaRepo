//! Structural projection only; history, sibling and visual references never enter these metrics.
#[cfg(test)]
#[path = "structure_validation.rs"]
mod validation;
use crate::{check_session, get_session, Backend, Session};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::State;

#[derive(Default)]
pub struct StructureState {
    active: Mutex<Option<(String, Arc<AtomicBool>)>>,
    gate: Mutex<()>,
    cache: Mutex<Option<(String, Arc<Report>)>>,
}
impl StructureState {
    pub fn invalidate(&self) {
        if let Ok(mut active) = self.active.lock() {
            if let Some((_, flag)) = active.take() {
                flag.store(true, Ordering::SeqCst);
            }
        }
        if let Ok(mut cache) = self.cache.lock() {
            *cache = None;
        }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Row {
    path: String,
    in_degree: usize,
    out_degree: usize,
    page_rank: f64,
    betweenness: Option<f64>,
    cycle: Option<usize>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Cycle {
    id: usize,
    size: usize,
    members: Vec<String>,
    witness: Vec<String>,
    witness_truncated: bool,
}
struct Report {
    rows: Vec<Row>,
    edges: usize,
    cycles: Vec<Cycle>,
    total_cycles: usize,
    cycle_nodes: usize,
    iterations: usize,
    residual: f64,
    sources: Vec<String>,
    betweenness_exact: bool,
}
struct Budget<'a> {
    session: &'a Session,
    cancelled: &'a AtomicBool,
    start: Instant,
}
impl Budget<'_> {
    fn check(&self) -> Result<(), String> {
        check_session(self.session)?;
        if self.cancelled.load(Ordering::SeqCst) {
            return Err("Structural analysis cancelled".into());
        }
        if self.start.elapsed() > Duration::from_secs(30) {
            return Err("Structural analysis exceeded 30 seconds; disable betweenness or narrow the projection".into());
        }
        Ok(())
    }
}

fn calculate(
    session: &Session,
    inheritance: bool,
    samples: usize,
    budget: &Budget<'_>,
) -> Result<Report, String> {
    let graph = &session.snapshot.graph;
    if graph.nodes.len() > 100_000 || graph.edges.len() > 500_000 {
        return Err("Structural graph exceeds 100,000 nodes / 500,000 source edges".into());
    }
    if graph.nodes.iter().map(|node| node.id.len()).sum::<usize>() > 32 * 1024 * 1024 {
        return Err("Structural path metadata exceeds 32 MiB".into());
    }
    let mut paths: Vec<_> = graph.nodes.iter().map(|node| node.id.clone()).collect();
    paths.sort();
    let n = paths.len();
    let index: HashMap<_, _> = paths
        .iter()
        .enumerate()
        .map(|(i, path)| (path.as_str(), i))
        .collect();
    let mut outgoing = vec![Vec::new(); n];
    let mut incoming = vec![Vec::new(); n];
    let mut unique = HashSet::new();
    for (i, edge) in graph.edges.iter().enumerate() {
        if i % 1024 == 0 {
            budget.check()?;
        }
        if !["import", "require", "re-export"].contains(&edge.kind.as_str())
            && !(inheritance && edge.kind == "prototype-parent")
        {
            continue;
        }
        let (Some(&source), Some(&target)) = (
            index.get(edge.source.as_str()),
            index.get(edge.target.as_str()),
        ) else {
            continue;
        };
        if unique.insert((source, target)) {
            outgoing[source].push(target);
            incoming[target].push(source);
        }
    }
    for list in outgoing.iter_mut().chain(incoming.iter_mut()) {
        list.sort_unstable();
    }
    let edge_count = unique.len();
    drop(unique);

    // Iterative Kosaraju, so a long dependency chain cannot overflow the native stack.
    let mut seen = vec![false; n];
    let mut order = Vec::with_capacity(n);
    for start in 0..n {
        if seen[start] {
            continue;
        }
        seen[start] = true;
        let mut stack = vec![(start, 0)];
        while let Some((node, next)) = stack.last_mut() {
            budget.check()?;
            if *next == outgoing[*node].len() {
                order.push(*node);
                stack.pop();
            } else {
                let child = outgoing[*node][*next];
                *next += 1;
                if !seen[child] {
                    seen[child] = true;
                    stack.push((child, 0));
                }
            }
        }
    }
    let mut component = vec![usize::MAX; n];
    let mut components = Vec::new();
    for start in order.into_iter().rev() {
        if component[start] != usize::MAX {
            continue;
        }
        let id = components.len();
        let mut members = Vec::new();
        let mut stack = vec![start];
        component[start] = id;
        while let Some(node) = stack.pop() {
            budget.check()?;
            members.push(node);
            for &parent in &incoming[node] {
                if component[parent] == usize::MAX {
                    component[parent] = id;
                    stack.push(parent);
                }
            }
        }
        members.sort_unstable();
        components.push(members);
    }
    let cyclic: Vec<bool> = components
        .iter()
        .map(|members| members.len() > 1 || outgoing[members[0]].contains(&members[0]))
        .collect();
    let total_cycles = cyclic.iter().filter(|&&value| value).count();
    let cycle_nodes = components
        .iter()
        .enumerate()
        .filter(|(i, _)| cyclic[*i])
        .map(|(_, m)| m.len())
        .sum();
    let mut groups: Vec<_> = components
        .iter()
        .enumerate()
        .filter(|(id, _)| cyclic[*id])
        .collect();
    groups.sort_by(|(a, ma), (b, mb)| mb.len().cmp(&ma.len()).then(a.cmp(b)));
    let mut cycles = Vec::new();
    let mut parent = vec![usize::MAX; n];
    let mut cycle_bytes = 0usize;
    for (id, members) in groups {
        budget.check()?;
        let start = members[0];
        let neighbor = *outgoing[start]
            .iter()
            .find(|&&node| component[node] == id)
            .ok_or("Missing cycle edge")?;
        let mut witness = vec![start];
        if neighbor == start {
            witness.push(start);
        } else {
            parent[neighbor] = neighbor;
            let mut queue = VecDeque::from([neighbor]);
            while parent[start] == usize::MAX {
                budget.check()?;
                let node = queue.pop_front().ok_or("Cycle witness not found")?;
                for &target in &outgoing[node] {
                    if component[target] == id && parent[target] == usize::MAX {
                        parent[target] = node;
                        queue.push_back(target);
                    }
                }
            }
            let mut tail = vec![start];
            let mut current = start;
            while current != neighbor {
                current = parent[current];
                tail.push(current);
            }
            tail.reverse();
            witness.extend(tail);
        }
        cycle_bytes += members
            .iter()
            .take(20)
            .chain(witness.iter().take(128))
            .map(|&i| paths[i].len())
            .sum::<usize>();
        if cycle_bytes > 64 * 1024 * 1024 {
            return Err("Cycle metadata exceeds 64 MiB".into());
        }
        cycles.push(Cycle {
            id,
            size: members.len(),
            members: members.iter().take(20).map(|&i| paths[i].clone()).collect(),
            witness_truncated: witness.len() > 128,
            witness: witness
                .into_iter()
                .take(128)
                .map(|i| paths[i].clone())
                .collect(),
        });
    }

    // Uniform teleport and uniform redistribution from dangling nodes; source -> dependency.
    let mut rank = vec![if n > 0 { 1.0 / n as f64 } else { 0.0 }; n];
    let mut residual = 0.0;
    let mut iterations = 0;
    for iteration in 0..60 {
        budget.check()?;
        if n == 0 {
            break;
        }
        let dangling: f64 = (0..n)
            .filter(|&i| outgoing[i].is_empty())
            .map(|i| rank[i])
            .sum();
        let mut next = vec![(0.15 + 0.85 * dangling) / n as f64; n];
        for source in 0..n {
            if source % 1024 == 0 {
                budget.check()?;
            }
            if outgoing[source].is_empty() {
                continue;
            }
            let contribution = 0.85 * rank[source] / outgoing[source].len() as f64;
            for &target in &outgoing[source] {
                next[target] += contribution;
            }
        }
        residual = rank.iter().zip(&next).map(|(a, b)| (a - b).abs()).sum();
        rank = next;
        iterations = iteration + 1;
        if residual < 1e-8 {
            break;
        }
    }
    let available: Vec<_> = (0..n).filter(|&i| !outgoing[i].is_empty()).collect();
    let k = if samples == 0 {
        0
    } else if available.len() <= 256 {
        available.len()
    } else {
        samples.min(available.len())
    };
    let sources: Vec<_> = (0..k).map(|i| available[i * available.len() / k]).collect();
    let mut between = vec![0.0; n];
    for &source in &sources {
        budget.check()?;
        let mut predecessors = vec![Vec::new(); n];
        let mut distance = vec![usize::MAX; n];
        let mut sigma = vec![0.0; n];
        let mut dependency = vec![0.0; n];
        let mut stack = Vec::new();
        let mut queue = VecDeque::from([source]);
        distance[source] = 0;
        sigma[source] = 1.0;
        while let Some(node) = queue.pop_front() {
            if stack.len() % 1024 == 0 {
                budget.check()?;
            }
            stack.push(node);
            for &target in &outgoing[node] {
                if distance[target] == usize::MAX {
                    distance[target] = distance[node] + 1;
                    queue.push_back(target);
                }
                if distance[target] == distance[node] + 1 {
                    sigma[target] += sigma[node];
                    if !f64::is_finite(sigma[target]) {
                        return Err("Shortest-path count overflow; disable betweenness".into());
                    }
                    predecessors[target].push(node);
                }
            }
        }
        while let Some(node) = stack.pop() {
            for &parent in &predecessors[node] {
                dependency[parent] += sigma[parent] / sigma[node] * (1.0 + dependency[node]);
            }
            if node != source {
                between[node] += dependency[node];
            }
        }
    }
    if n > 2 && k > 0 {
        let factor = available.len() as f64 / k as f64 / ((n - 1) as f64 * (n - 2) as f64);
        for value in &mut between {
            *value *= factor;
        }
    }
    let rows = (0..n)
        .map(|i| Row {
            path: paths[i].clone(),
            in_degree: incoming[i].len(),
            out_degree: outgoing[i].len(),
            page_rank: rank[i],
            betweenness: if samples > 0 { Some(between[i]) } else { None },
            cycle: if cyclic[component[i]] {
                Some(component[i])
            } else {
                None
            },
        })
        .collect();
    Ok(Report {
        rows,
        edges: edge_count,
        cycles,
        total_cycles,
        cycle_nodes,
        iterations,
        residual,
        sources: sources.into_iter().map(|i| paths[i].clone()).collect(),
        betweenness_exact: samples > 0 && k == available.len(),
    })
}

#[tauri::command]
pub async fn structural_metrics(
    state: State<'_, Arc<Backend>>,
    snapshot_id: String,
    query_id: String,
    inheritance: bool,
    samples: usize,
    sort: String,
    filter: String,
    page: usize,
    cycle_page: usize,
    selected_path: Option<String>,
) -> Result<serde_json::Value, String> {
    if ![0, 8, 16, 32].contains(&samples)
        || !["pageRank", "inDegree", "outDegree", "betweenness"].contains(&sort.as_str())
        || filter.len() > 512
        || page > 1000
        || cycle_page > 5000
        || query_id.is_empty()
        || query_id.len() > 128
    {
        return Err("Invalid structural query".into());
    }
    let session = get_session(&state, &snapshot_id)?;
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = state.structure.active.lock().map_err(|e| e.to_string())?;
        if let Some((_, old)) = active.replace((query_id.clone(), cancelled.clone())) {
            old.store(true, Ordering::SeqCst);
        }
    }
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = state.structure.gate.lock().map_err(|e| e.to_string())?;
        let budget = Budget { session:&session,cancelled:&cancelled,start:Instant::now() }; budget.check()?;
        let key = format!("{}:{inheritance}:{samples}:structure-v2",session.id);
        let cached = state.structure.cache.lock().map_err(|e| e.to_string())?.as_ref().filter(|(k,_)| *k==key).map(|(_,r)| r.clone());
        let was_cached = cached.is_some();
        let report = if let Some(report) = cached { report } else {
            let report = Arc::new(calculate(&session,inheritance,samples,&budget)?);
            let mut cache = state.structure.cache.lock().map_err(|e| e.to_string())?;
            budget.check()?; *cache = Some((key,report.clone())); report
        };
        let filter = filter.to_lowercase();
        let mut rows: Vec<_> = report.rows.iter().filter(|r| r.path.to_lowercase().contains(&filter)).collect();
        let value = |r: &Row| match sort.as_str() { "inDegree"=>r.in_degree as f64,"outDegree"=>r.out_degree as f64,"betweenness"=>r.betweenness.unwrap_or(0.0),_=>r.page_rank };
        rows.sort_by(|a,b| value(b).total_cmp(&value(a)).then(a.path.cmp(&b.path)));
        let total = rows.len();
        let result = serde_json::json!({"snapshotId":session.id,"queryId":query_id,"cached":was_cached,"algorithm":"structure-v2",
            "nodeCount":report.rows.len(),"edgeCount":report.edges,"inheritance":inheritance,"iterations":report.iterations,
            "residual":report.residual,"converged":report.residual<1e-8,"damping":0.85,
            "sampleCount":report.sources.len(),"sampleSources":report.sources,"betweennessExact":report.betweenness_exact,
            "totalCycles":report.total_cycles,"cycleNodes":report.cycle_nodes,"cycles":report.cycles.iter().skip(cycle_page*20).take(20).collect::<Vec<_>>(),"cyclePage":cycle_page,
            "rows":rows.into_iter().skip(page*100).take(100).collect::<Vec<_>>(),"total":total,"page":page,
            "selected":selected_path.and_then(|path| report.rows.iter().find(|r| r.path==path).cloned())});
        budget.check()?;
        if serde_json::to_vec(&result).map_err(|e| e.to_string())?.len()>4*1024*1024 { return Err("Structural summary exceeds 4 MiB".into()); }
        Ok(result)
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn cancel_structure(state: State<'_, Arc<Backend>>, query_id: String) -> Result<(), String> {
    if let Some((_, flag)) = state
        .structure
        .active
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .filter(|(id, _)| *id == query_id)
    {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}
