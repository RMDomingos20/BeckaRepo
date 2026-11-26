# Large-Scale Benchmark & Graph Navigation (Gaby-CMU) — 2026-11-25

Measured against the **Gaby-CMU** local benchmark repository containing **85,224 files and 91,744 connections**.

## Rust Engine Scan Performance

The `profile_scan` example measures pure Rust scanning in `--release` mode (excluding compilation, snapshot serialization, WebView IPC transfer, and rendering):

```powershell
cargo run --release --offline -p beckarepo-core --example profile_scan -- "D:\path\to\repository"
```

| Stage (seconds) | Intermediate Build | Final Build |
| --- | ---: | ---: |
| Inventory | 44.36 | 37.43 |
| Read & index | 7.60 | 39.95 |
| Connection extraction | 262.85 | 149.50 |
| Revision verification | 36.40 | 9.11 |
| **Total** | **351.21** | **235.99** |

Both builds ran sequentially on the same folder under a standard Windows session. The intermediate build already skipped lookups for nonexistent filenames; the final build additionally shares the path set across resolvers and batches revision checks across up to 4 concurrent tasks. Incremental reopening reuses the valid index when unchanged.

Total scan time dropped by **32.8%**, and revision verification dropped by **75%**. Because each run was a single pass without controlling OS disk cache (and concurrent compilation/disk activity occurred during parts of the run), phase-level fluctuations reflect disk caching as well as code changes. In a separate paired run inside a sandboxed environment, totals were 516.22 s and 408.96 s.

Earlier 2026-10-31 measurements (in seconds) on the same 85,224-file / 91,744-edge dataset (89,381,332-byte snapshots):

| Run | Inventory | Read | Analysis | Verification | Total Scan | Serialization |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Before | 49.64 | 9.01 | 31.51 | 51.62 | 141.77 | 0.29 |
| After | 24.19 | 6.60 | 26.50 | 22.01 | 79.30 | 0.18 |

All four recent scans produced identical counts — 85,224 files, 91,744 edges, 0 warnings — and the exact same sorted-edge checksum (`cb2308b63c9d8a13`). Connection extraction remains the primary bottleneck at this scale.

## Desktop UI & Illustrated Manual

In **BeckaRepo Validation** (isolated test DB, dev command), opening `Gaby-CMU` through the native Windows folder picker ran scanning, dependency mapping, and batched IPC transfer until the file tree displayed **85,224 files and 91,744 connections**. Based on timestamps captured before clicking open (`18:16:32`) and once the tree was visible (`18:21:13`), end-to-end opening took under **4 min 41 s** (including Rust engine, live IPC, and WebView rendering, subject to Windows disk cache state).

In the same session, opening **Global Graph** rendered the 85,224-file counter in **2.0 s** from click:
- **Galaxy layout** organized nodes into **214 spatial clusters**.
- **Atlas layout** partitioned the same files into **584 clusters**.
- In both layouts, Auto edge mode drew **1,200 of 91,744 eligible connections** at overview zoom, keeping full detail accessible via zoom and file selection.

In Microsoft Edge (testing the compiled UI against the real snapshot via a local Tauri command shim), the tree became interactive in ~2.1 s once data was loaded, exercising **Galaxy**, **Atlas**, **Folders**, **Free**, and the Portuguese **Guide** modal. A smaller test graph also verified **Atlas**, **Classic (SVG)**, returning to **Files**, and the English **Guide**.

- **Galaxy** and **Atlas** compute deterministic, stable layouts: Galaxy prioritizes distinct neighbors (weighting inbound links 2× and outbound 1×, influenced by active filters), while Atlas allocates proportional group areas sorted by path.
- **Free** continues delegating force simulation to the Web Worker.
- Symbols, controls, and layout rules are documented in the in-app Guide ([docs/MANUAL.md](../../MANUAL.md)) and [README.md](../../../README.md).

## Automated Checks

This pass verified **63 Rust tests**, **19 JavaScript tests**, ESLint, and the Windows x64 NSIS installer build — covering file policy, revision checks, cancellation, limits, batched transport cursors, relation integrity, Galaxy center/periphery placement, and Atlas group separation.
