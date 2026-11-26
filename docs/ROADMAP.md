# BeckaRepo technical roadmap

BeckaRepo maps file dependencies, Git history and symbols in a local worktree. The table below records the capabilities available in the desktop app and the work still open. Implementation boundaries and data contracts are documented in the [architecture](ARQUITETURA_ROADMAP.md).

## Next priorities

| Priority | Work | How to verify it |
| --- | --- | --- |
| 1. Repository opening (F0/F1) | Separate inventory, parsing, revision checks, IPC transfer and time to first usable view. Compare cold opens, warm opens and incremental refreshes on the same corpus. | Record corpus size, edge count, cache conditions, stage times and peak memory. Compare graph endpoints and counts before and after optimization. |
| 2. Dense graph navigation (F8) | Keep a selected file and its immediate connections legible across zoom and grouping changes. Measure the native WebView before choosing further layout or rendering changes. | Exercise Galaxy, Atlas, Free and folder drill-down with a large graph. Record frame times during interaction, check selection and keyboard navigation, and compare counts against the source graph. |
| 3. Resolution coverage (F5–F7) | Extend path and package resolution before exposing cross-file symbol calls. | Use fixtures with known targets, duplicates and unresolved expressions. Check source ranges, diagnostics, precision and recall by language. |

## Phase coverage

| Phase | Available | Open work |
| --- | --- | --- |
| F0 · Policy and diagnostics | Shared file exclusions, root confinement and read budgets. | Diagnostics for remaining aggregate limits, structured command errors, export scope and per-stage measurements. |
| F1 · Inventory and transport | Source-free snapshots, revision checks, batched IPC, on-demand previews and paginated search. Manual refresh reuses eligible analysis. | Measure end-to-end opening time and memory, including the transfer and first render. |
| F2 · Persistence | SQLite worktree identities, tags, notes, appearance preferences, backup, restore and reassociation. | Surface annotations for deleted files and verify installation and recovery on a clean machine. |
| F3 · Git | Per-file history, project hotspots, optional authorship, co-change and worktree-aware caching. | Reconcile historical renames across project-wide queries and classify deleted paths. |
| F4 · Structure | Cycle witnesses, directed degrees, PageRank and exact or sampled betweenness. | Cross-check numerical results against an independent implementation. |
| F5 · Parsing | Tree-sitter pilot for JavaScript, TypeScript and Rust; web aliases, Cargo targets and literal Rust path attributes. | Extend the reference corpus, TS project references, Rust conditional modules and re-export resolution. |
| F6 · External packages | npm and Cargo manifest/lockfile readers, direct Maven declarations, consumers and package evidence. | Extend Yarn/pnpm lock coverage, Maven model resolution and Java import mapping. |
| F7 · Symbols | On-demand symbols, per-function complexity and lexical calls within a file. | Cross-file bindings, type-dependent calls and method dispatch. |
| F8 · Visualization | Galaxy and Atlas, off-thread Free layout, explicit folder expansion, density grouping, selection focus and keyboard camera controls. | Frame-time percentiles, zoom-driven folder detail, view-state persistence and further accessibility checks. |

## Dependencies and later work

F1 supplies the snapshot used by the analysis and graph views. Git caching also depends on F2 identities. Broader symbol-call coverage depends on F5 resolution; package evidence from F6 can help identify external boundaries. F8 rendering can be improved and measured independently of those language features.

Multi-repository views, filesystem watching, collaborative annotations and assisted architecture analysis remain exploratory. A WebGPU or Rust/Wasm experiment should compare the same dataset and interaction against the existing canvas and Worker.

For repeatable checks, use the [Rust integration tests](../crates/beckarepo-core/tests/), the [frontend tests](../tests/) and the [scanner profiler](../crates/beckarepo-core/examples/profile_scan.rs). For the controls available today, see the [illustrated manual](MANUAL.md).
