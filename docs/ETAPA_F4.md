# F4 — Structural Metrics and Cycles in Rust

## Usage and Scope

Open a folder and select **Analysis → Structure and cycles**. Calculations run against the full repository snapshot (not the visual subset of the global graph). You can optionally include `prototype-parent` alongside `import`/`require`/`re-export` relations, toggle disabled or sampled betweenness centrality, sort metrics, and filter paths (text filtering narrows the table view, not the mathematical graph).

Click any path to inspect it in the file panel. Metrics paginate at 100 rows and cyclic components paginate at 20 rows; expanding any cycle group displays a closed dependency witness path whose nodes can be clicked to inspect.

All structural computations run on a blocking Rust task in `src-tauri/src/structure.rs` with cooperative cancellation and an in-memory cache (`structure-v2`), without sending source files to the UI or contacting any external service.

## Structural Projection

- **Universe:** all snapshot nodes (including isolated files). Direction: `consumer → dependency`.
- **Edge types:** `import`, `require`, and `re-export` by default; `prototype-parent` optional. `reference`, `sibling`, RSI, visual, and Git co-change edges are excluded.
- **Simple directed graph:** duplicate edges between the same `(source, target)` pair are deduplicated regardless of evidence or type; the projection is unweighted and directed.
- **Coverage:** reflects the active parser's resolved edges. Dynamic imports and unresolved aliases are absent rather than proven nonexistent. F5 preserves intra-file self-edges syntactically; legacy regex heuristics may omit them.

## Cycle Detection

Iterative Kosaraju's algorithm computes strongly connected components (SCCs) without recursion limits across deep file chains. Any component with > 1 node, or 1 node with an explicit self-edge, is reported as cyclic. A breadth-first search within each component produces a closed witness path (using a shared parent buffer across disjoint components).

Witness paths are capped at 128 hops (explicitly marked truncated if longer without claiming closure), and summarized member previews show up to 20 paths. Group IDs apply to the current projection/snapshot and may change across re-scans.

## Metrics

| Metric | Definition |
| --- | --- |
| **In-degree** | Distinct files depending on this file within the projection. |
| **Out-degree** | Distinct dependencies of this file within the projection. |
| **PageRank** | Power iteration along `consumer → dependency`, damping `0.85`, uniform teleportation, uniform redistribution of sink mass, initialized to `1/N`. |
| **Betweenness** | Fraction of directed shortest paths passing through the node (excluding endpoints), computed via Brandes and normalized by `(N − 1)(N − 2)` for `N > 2`. |

- **PageRank convergence:** up to 60 iterations with an **absolute** L1 residual tolerance of `1e-8`. Iteration count, final residual, and any non-convergence notice are displayed explicitly.
- **Betweenness sampling:** only nodes with `out-degree > 0` are eligible sources. When eligible sources ≤ 256, calculation is **exact**; above 256, it deterministically selects `8 / 16 / 32` evenly spaced sources (default `16`) from the sorted path list and scales contributions by `eligibleSources / sampledSources` prior to normalization. Path-count overflow returns an error prompting the user to disable betweenness.

High centrality does not prove fragility, bugs, or code quality — degree, PageRank, and betweenness are separate structural indicators with visible parameters.

## Combined Git Evidence

Opening **Project Git** and then **Structure and cycles** shows a selected file's structural metrics alongside churn/commit frequency if the file appears on the most recently loaded Git page (displaying `HEAD` and time window explicitly; absent paths show unavailable rather than zero). Because structural metrics reflect the live snapshot (including uncommitted work) while churn reflects `HEAD` history, the panel surfaces this distinction without generating synthetic risk labels.

## Limits & Lifecycle

- **Scale caps:** up to 100,000 nodes, 500,000 source edges, and 32 MiB of node IDs/paths (explicit error if exceeded — never silently truncated).
- **Time budget:** 30-second cooperative deadline checked across projection, SCC, PageRank, BFS, and output assembly.
- **Concurrency:** single-flight structural queue (new requests cancel prior jobs), independent from the Git queue.
- **Caching & paging:** one complete `structure-v2` result cached in RAM per snapshot/parameters/version and invalidated on snapshot close, refresh, or DB restore. Paging uses 100 metrics / 20 components per page (64 MiB cycle metadata cap, 4 MiB response cap) tagged with snapshot and query IDs.

## Open Follow-ups

- Numerical cross-check against external reference implementations (e.g., NetworkX) on synthetic and real benchmarks.

## References

- [Git log: format, numstat, and mailmap](https://git-scm.com/docs/git-log)
- [NetworkX: PageRank reference](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.link_analysis.pagerank_alg.pagerank.html) (conceptual reference; tolerance criteria above are specific to BeckaRepo)
- [NetworkX: Brandes betweenness centrality](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.centrality.betweenness_centrality.html) (deterministic source selection and scaling above are specific to BeckaRepo)
