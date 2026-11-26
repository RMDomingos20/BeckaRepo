# F8 — Canvas Physics in a Web Worker (2026-10-30)

Follow-up to the [F6/F7 report](RELATORIO_F6_F7.md). Moves D3 force calculations into a module Web Worker while keeping rendering and interaction on the UI thread across global/search graphs (> 800 nodes) and the co-change Canvas. Introduced no database changes, new dependencies, or external downloads.

## Implementation

- `src/workers/denseLayoutRuntime.js`: preserves existing force constants and thresholds, schedules ticks, and transfers coordinate buffers with backpressure (at most one unacknowledged batch, posted roughly every 80 ms or upon stabilization).
- `src/utils/denseLayoutClient.js`: sends numeric topology/positions only (no source text or file paths), tracks drag revisions, discards stale responses, terminates cleanly on graph switches, falls back to static positions on failure, and enforces a 30-second stall watchdog.
- `DenseGraphCanvas.jsx`: integrates the Worker client, preserves selection, camera, and positions within the same snapshot/mount, supports node pin/unpin, and reports separate compute, apply, and draw timings.
- The Worker receives no React state, camera state, filenames, or repository contents. Topology assembly, position application, spatial indexing, clipping, and Canvas drawing remain on the UI thread.

## Checks

| Check | Result |
| --- | --- |
| JavaScript | **12 passed**, 0 failed (7 existing + 5 new Worker/client tests). |
| Real Worker tests | Buffer ownership transfer, single unacked batch backpressure, 1,000 nodes with pin/unpin and stabilization, 85,224 nodes with isolated nodes, and rejection of invalid topologies. |
| Renderer client tests | Responses predating drag/unpin or arriving after unmount are discarded; non-finite coordinates and init failures safely retain the static layout. |
| Rust | **63 passed in the prior F6/F7 pass**; no Rust files changed in this UI-only update. |
| Formatting & Lint | `cargo fmt --all -- --check` and `npm run lint` passed with zero errors. |
| Windows build | `npm run build` succeeded: 50.48 kB Worker bundle, release Rust binary, and NSIS x64 1.1.0 installer (4.31 MiB; not executed). |

- Binary: `target/release/beckarepo.exe` (19,949,568 bytes, SHA-256 `C74AD93A4F4174CB85B537BBCBE233783C5A5B28BFB10537E77D4299BB7A0834`)
- Installer: `target/release/bundle/nsis/BeckaRepo_1.1.0_x64-setup.exe` (4,515,570 bytes, SHA-256 `00AEE18E07E1B40FBEC1A4778765C743DE2A213AC59B749711EB0D49F6A044A6`)

## Synthetic Benchmark

Executed `node tests/benchmark-dense-layout.mjs` on AMD Ryzen 5 2600, 16 GiB RAM, Node v22.22.2 (single pass per scenario, identical algorithm/scheduling, without Canvas drawing):

| Nodes / Connections | Total Time (Main / Worker) | Compute Time (Main / Worker) | Max Event-Loop Gap (Main / Worker) |
| --- | ---: | ---: | ---: |
| 1,000 / 1,500 | 4,724 / 5,788 ms | 852 / 868 ms | 44 / 32 ms |
| 10,000 / 15,000 | 20,867 / 21,208 ms | 17,155 / 16,713 ms | 309 / 32 ms |
| 85,224 / 91,745 | 2,452 / 3,853 ms | 819 / 1,159 ms | 101 / 32 ms |

Graphs over 15,000 nodes use simplified forces, explaining why the 85k run finishes faster than 10k. Using a Worker adds initialization/transfer overhead but keeps the main-thread timer gap flat at ~32 ms instead of spiking to 309 ms. This measures event-loop blocking, not WebView FPS, p95 frame time, or memory.

## Native UI Validation

Tested in **BeckaRepo Validation** (`com.beckarepo.validation`) on synthetic fixture `target/validation/f8-ui-repo` (1,001 JS files arranged in an import ring: **1,001 files, 1,001 connections**):

- Opened and rendered the global graph without errors.
- Worker stabilized in 151 iterations (988 ms cumulative compute, 516 KiB received); sample frame drew in 1.6 ms with 0.1 ms apply time.
- Selecting `file0.js` in the tree highlighted only its two connections (`file1.js` and `file1000.js`), matching the details panel.
- **Locate selected** zoomed camera from 62.2% to 200%, preserving selection and edges.
- Dragging the selected node moved it immediately, pinned it, and resumed background simulation; double-clicking unpinned it back into force simulation.
- Toggling the `import` filter off and on transitioned connections `2 → 0 → 2` while preserving `file0.js` selection and 200% zoom across Worker restart.

## Limits & Next Deliverable

`VIS-01` remained partial here pending real-world WebView benchmarks (later measured in [2026-11-25 Graph Report](../2026-11-25/RELATORIO_GRAFO.md)), clean-machine install checks, and edge-case keyboard/focus/locale transitions. Small SVG and local neighborhood graphs still run force simulation on the main thread.

Next slice: [F8 Folder Drill-Down](../2026-10-31/RELATORIO_F8_PASTAS.md).

## Reproduction

```powershell
node --test tests/ui-utils.test.mjs tests/dense-layout.test.mjs
node tests/benchmark-dense-layout.mjs
npm run lint
npm run build
```

`tests/run-validation.ps1 -Build` includes the five Worker tests alongside prior suites.
