# BeckaRepo Pre-Migration Diagnostic

> Historical baseline recorded before the Rust/Tauri rewrite (2026-10-25). The Electron host, JavaScript Web Worker, and JS regex parser described below have been replaced. For the current architecture, see [MIGRACAO_RUST.md](MIGRACAO_RUST.md) and [ROADMAP.md](ROADMAP.md).

## Legacy Capabilities & Boundaries (Pre-Migration)

| Area | Legacy Implementation & Limits |
| --- | --- |
| Repository opening | Browser-based directory selection; drag-and-drop added recursive directory traversal across Chromium entries. |
| File reading | Batches of 80 files; text capped at `< 500 KiB`; binaries retained local handles for preview. Ignored generated directories and specific names without `.gitignore` evaluation. |
| Dependencies | Regular expressions for JS/TS, HTML, CSS, Python, Go, C/C++, and partial imports in C#/Java/PHP/Kotlin/Dart/Scala/Rust. |
| Domain references | YAML IDs, `parent`, RSI sprites, `meta.json → states[].name.png`, and generic file paths. |
| Structural inferences | Same-basename associations, Dockerfile/Compose, and root workflow/build references (heuristic inferences rather than runtime proof). |
| Explorer | Expandable file tree, filename/path filtering, synchronized selection, and resizable panels. |
| Content search | Case-insensitive literal matching (600 ms debounce, ≥ 2 chars) including immediate graph neighbors. |
| Global graph | SVG up to 800 nodes; 2D Canvas above 800; simplified force mode above 15,000 nodes; D3 physics on renderer thread. |
| Local graph | 1-hop and 2-hop neighborhood (second-hop edge counter capped at 50 expansions). |
| Clustering | Folder depth, file type, naming patterns, and label propagation (LPA) with hulls and group isolation. |
| Details panel | File size, inbound/outbound edges, highlighted code, zoom/pan image preview, audio/video preview, and local graph. |
| Export | Markdown export of tree and counts (did not export full edge sets, layout coordinates, tags, or notes). |
| Languages | Portuguese and English via React Context + `localStorage`. |
| Desktop shell | Electron opening Vite dev server or `dist/index.html`, packaged via `electron-builder` NSIS. |

## Legacy Module Map (Pre-Migration)

| File / Group | Role |
| --- | --- |
| `src/RepoVisualizer.jsx` | Repository opening flow, project state, search, selection, filters, export, and panel composition. |
| `src/core/analyzeRepository.js`, `contract.js`, `paths.js` | Standalone analyzer entry, contract validation, and path helpers (decoupled from React, Electron, D3, and fs). |
| `src/services/repositoryFiles.js` | File input, exclusions, read limits, and directory traversal. |
| `src/services/analysisClient.js` | Worker transport and UI data adapter (`File`, content, colors, Map, tree). |
| `src/utils/parser.js` | Heuristic resolution and edge extraction. |
| `src/utils/graphWorker.js` | Background Worker running the JS analyzer. |
| `src/utils/clustering.js` | Four clustering strategies and node/group index. |
| `src/utils/constants.js` | Extensions, filters, visual categories, and syntax highlight keywords. |
| `src/utils/helpers.jsx` | Formatting, folder tree construction, and React code highlighting. |
| `CanvasGlobalGraph.jsx`, `MiniGraph.jsx` | D3 rendering, simulation, and interactions. |
| `TreeNode.jsx`, `FilePanel.jsx` | Tree navigation and file inspection. |
| `ConnectionFilter.jsx`, `ClusteringControls.jsx`, `ContextMenu.jsx` | Filters, clustering controls, and context menu actions. |
| `SettingsModal.jsx`, `ManualModal.jsx` | Language preferences and in-app documentation. |
| `useTags.js`, `useLayout.js`, `useResizable.js`, `useTranslation.jsx` | Hooks for tags, panel visibility/sizing, and i18n. |
| `main.js`, `preload.js` | Electron main window and preload API bridge. |
| `crates/beckarepo-core/` | Initial Rust crate (Serde DTOs and contract validation prior to parser migration). |
| `tests/` | Analysis boundary regression cases and shared JSON fixtures. |

## Items Tracked for Migration

| Item | Legacy Status | Migration Action Taken |
| --- | --- | --- |
| AI architecture analysis | Future goal in original README | Deferred until local deterministic engine matures; explicit scope/consent required. |
| Risk detection | Unimplemented | Replaced by concrete cycle detection, fan-in/fan-out, PageRank, betweenness, and Git hotspots. |
| Repository clustering | Implemented | Kept and paired with deterministic Galaxy/Atlas layouts and folder drill-down. |
| Multi-repository view | Single root only | Tracked in roadmap (requires multi-root identities and namespaces). |
| Live monitoring | No watcher or incremental cache | Manual incremental refresh implemented in F1; live watcher tracked in roadmap. |
| Collaborative annotations | No backend sync | Local SQLite notes, backups, and JSON import/export delivered in F2. |
| Local tags & notes | Hook only without wired editor | Wired `AnnotationEditor.jsx` + SQLite storage in F2. |
| AST, WebGL & 60 FPS @ 85k nodes | Unverified claims in legacy README | Corrected docs; implemented Tree-sitter in F5 and measured Dense Canvas in F8. |

## Recommended Direction (Executed)

The migration moved filesystem scanning, indexing, parsing, Git inspection, and SQLite persistence into a native Rust core (`beckarepo-core` + `src-tauri`) while keeping React and D3 as the UI consumer over Tauri 2 IPC ([Tauri Process Model](https://v2.tauri.app/concept/process-model/), [Serde](https://serde.rs/derive.html)). See [MIGRACAO_RUST.md](MIGRACAO_RUST.md) and [ROADMAP.md](ROADMAP.md).
