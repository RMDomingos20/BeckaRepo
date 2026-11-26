# F8 — Folder Drill-Down Mode (2026-10-31)

Follow-up to [F8 Worker Physics](../2026-10-30/RELATORIO_F8_WORKER.md). Adds **Detail → Folders** mode on the Canvas for global and search graphs exceeding 800 files. Directory expansion is explicit rather than driven by automatic zoom thresholds.

## Changes

- Partitions nodes visually by folder path, keeping root files individual and expanding subfolders progressively so every file has exactly one visible representative.
- Keeps the selected file individual even inside a collapsed branch, subtracting it from the collapsed folder's file count. Search matches are summed per group.
- Aggregates edges by visible endpoints, relationship type, and direction (bidirectional co-change edges remain distinct). Intra-folder edges are counted as internal metrics rather than drawn as self-edges; file self-references do not create folder edges.
- Renders folders as squares and files as circles, displaying edge multiplicities when space permits. Includes a searchable, paginated (20/page) **Browse by folders** panel with branch/full collapse controls.
- Preserves camera and known positions within the same mount/snapshot; newly expanded children spawn near their previously visible parent. Position simulation remains in the Worker, while raw graph data and F4 structural metrics stay untouched.

Primary files: `src/utils/folderProjection.js`, `src/components/FolderGraphCanvas.jsx`, integrated via `CanvasGlobalGraph.jsx` and `DenseGraphCanvas.jsx`. No new dependencies or SQLite migrations.

## Automated Tests

| Check | Result |
| --- | --- |
| JavaScript | **17 passed**, 0 failed: 7 utility tests, 5 Worker tests, 5 folder-projection tests. |
| Edge/count conservation | Verified direction, types, bidirectionality, multiplicity, internal cycles, self-references, selected node isolation, and search match counts. |
| Identity & hierarchy | Verified Unicode/special folder names, exact descendant collapse, inherited positions, and preserved pins. |
| Synthetic scale | Preserved 85,224 files and 91,745 edges across two directory levels; projection ran in 597 ms in Node (not a WebView frame measurement). |
| Lint & Build | `npm run lint` clean; `npm run build` produced Vite bundle, Rust release binary, and NSIS 1.1.0 x64 installer (~4.31 MiB; not executed). |
| Rust | No Rust files modified; prior 63-test pass from [2026-10-30](../2026-10-30/RELATORIO_F6_F7.md) stands. |

- Binary: `target/release/beckarepo.exe` (19,951,616 bytes, SHA-256 `982EF98F2255A738E81553996C62AF8CC45D73D8E08A3AD00F3AC783A24E8D8D`)
- Installer: `target/release/bundle/nsis/BeckaRepo_1.1.0_x64-setup.exe` (4,516,074 bytes, SHA-256 `175D4F2092C08CDE8A38E012AFA273077CD4D12EFB6DF477591803CFC2AAC8B0`)

## Visual Validation

Verified in **BeckaRepo Validation** (`com.beckarepo.validation`) using isolated fixture `target/validation/f8-folder-repo` (1,001 files and 1,000 imports to `root.js`: `lib=250`, `src=500` with 250 direct + 250 in `src/deep`, `tests=250`, plus `root.js`):

- Clean load and graph opening with zero errors.
- **Folders** mode collapsed the scene to 4 representatives and 3 aggregated edges while conserving all 1,000 connections.
- Fit-to-view displayed `lib=250`, `src=500`, `tests=250`, directional arrows into `root.js`, and multiplicities (`import ×250 / ×500 / ×250`).
- Folder list matched counts; expanding `src` revealed `src/deep=250` and 250 immediate files while keeping zoom at 200%.
- Selecting `src/file0.js` and collapsing `src` kept `src/file0.js` individual, decremented `src` from 500 to 499 without duplication, and **Locate selected** centered the file and its edge to `root.js` at 200% zoom.
- During live dev hot-reload across the update, an open window hit `Cannot destructure property 'preferences' of 'useTranslation(...)' as it is undefined`; clicking **Restart App** recovered cleanly and reloaded the fixture without issues (likely dev-time Context invalidation on hot reload).

## Limits & Open Items

`VIS-02` is delivered for explicit folder expansion. `VIS-01`/`VIS-03` and global F8 remain partial: projection recalculates on the UI thread on structural changes, very flat roots with thousands of siblings can still look dense, and existing line/label drawing budgets apply.

Real-world 85k-file rendering and Galaxy/Atlas layout measurements were captured later in [2026-11-25 Graph Report](../2026-11-25/RELATORIO_GRAFO.md). Automatic zoom-level LOD, persistence across views/snapshots, off-thread SVG/local physics, and GPU/Wasm evaluations remain open in [ROADMAP.md](../../ROADMAP.md).

## Reproduction

```powershell
node --test tests/ui-utils.test.mjs tests/dense-layout.test.mjs tests/folder-projection.test.mjs
npm run lint
npm run build
```

`tests/run-validation.ps1 -Build` runs the full suite. To test manually, launch `npm run dev`, open a repository with > 800 files, switch to **Global graph → Detail → Folders**, and use **Browse by folders** to expand/collapse branches.
