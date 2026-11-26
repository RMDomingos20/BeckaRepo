# F8 — Dense Graph Navigation, Worker Physics, and Folder Drill-Down

Covers all three F8 visualization deliveries: legibility and dense Canvas navigation (`DenseGraphCanvas.jsx`), off-thread Worker force physics (`denseLayoutRuntime.js`), and progressive folder drill-down (`FolderGraphCanvas.jsx`).

## 1. Dense Graph Navigation (`DenseGraphCanvas.jsx`)

Prioritized to address legibility degradation observed on an **85,224-file, 91,745-connection** dataset, where the earlier Canvas lowered node opacity as zoom increased (`0.4 / scale`), scaled strokes in world coordinates, and drew all eligible edges unconditionally.

`DenseGraphCanvas.jsx` replaces the legacy Canvas for global and search graphs exceeding 800 nodes while keeping the SVG Classic mode available up to 800 nodes without truncating underlying graph data or filters.

### Controls & Exploration

1. Open **Global graph** and zoom via mouse wheel or **+ / −** buttons (`0.002×` to `64×`).
2. Numbered circles aggregate screen-nearby nodes into `24×24 px` spatial clusters; click to zoom into that region (tooltip shows exact counts even when labeled `999+`).
3. Click a node (or select via tree and click **Locate selected**) to inspect its neighborhood; **Automatic** highlights incident edges and neighbors, and hovering without a selection previews local links.
4. **File only** restricts edges to the active selection/hover; **All (up to 12,000)** broadens context within explicit drawing budgets.
5. **Clear selection** resets focus; **Fit all** frames all nodes in the active filter (including isolated nodes).
6. Drag background to pan; drag a node to pin it; double-click to release it.
7. Keyboard navigation when focused: `+`, `−`, arrow keys, `Home`, and `Escape`.

### Visual & Spatial Rules

- Node radii, line widths, labels, and hit-test tolerances are sized in CSS pixels; opacity stays readable across zoom levels while non-neighborhood nodes dim during focus.
- Spatial clustering activates above `3,000` visible nodes in the queried region and remains active until dropping to `≤ 2,000` (hysteresis prevents flicker). Selected nodes and highlighted endpoints never collapse into clusters. Search clusters carry a highlighted border and tooltip match count.
- **Connection budgets:** `1,200` (Auto, unfocused), `5,000` (focused incident links), `12,000` (All), using deterministic sampling above budget and displaying drawn vs. eligible counts in the footer. Viewport clipping preserves edges whose endpoints both lie off-screen when crossing the viewport.
- Direction arrows appear on focused edges when space allows; collision-aware labels cap at 80 (prioritizing selected, hovered, and neighbor nodes); **Show groups** displays up to 12 cluster captions at overview zoom.
- `ResizeObserver` adapts Canvas backing store dimensions to panel resizes and device pixel ratio while preserving camera center; filter changes within the same snapshot/mount preserve known positions and camera.

## 2. Off-Thread Worker Physics (2026-10-30)

`DenseGraphCanvas` offloads D3 force simulation to a module Web Worker (`src/workers/denseLayoutRuntime.js` managed by `src/utils/denseLayoutClient.js`) across global/search Canvas graphs (> 800 nodes) and the co-change overlay.

- **Strict isolation:** transfers only numeric geometry (`4 Float64` per node, `2 Uint32` per edge on init; `2 Float64` per node back) via transferable buffers — never source code, file paths, React state, or camera state.
- **Backpressure & revisions:** posts updates at most every ~80 ms with at most 1 unacknowledged batch in flight. Dragging pins locally and increments a drag revision so stale Worker frames are ignored; double-clicking unpins and reheats the simulation. Switching graphs/filters terminates the old Worker; a 30 s stall watchdog or error safely falls back to static layout.
- **Graph performance telemetry:** reports cumulative compute time/iterations, last batch apply time, latest Canvas draw duration, and transferred coordinate bytes. Synthetic comparison: [validation/2026-10-30/RELATORIO_F8_WORKER.md](validation/2026-10-30/RELATORIO_F8_WORKER.md).

## 3. Folder Drill-Down Mode (2026-10-31)

For Canvas graphs (> 800 nodes), **Detail → Folders** projects the repository into progressive directory representatives (`src/utils/folderProjection.js`, `src/components/FolderGraphCanvas.jsx`):

- Squares represent folders; circles represent individual files (root files remain individual; clicking a folder square reveals its immediate files and subfolders). **Browse by folders** offers search, 20-item pagination, counts, and branch/full collapse controls.
- Every file belongs to exactly one visible representative. The selected file is always extracted from its collapsed folder and rendered individually without double-counting. Search match counts aggregate per folder.
- Edges between visible representatives are summed by `(endpoints, type, direction)`, keeping bidirectional co-change pairs distinct and tracking intra-folder edges internally (never as fake folder self-loops). Line labels display type and multiplicity within the 80-label budget.
- Expansion is explicit (not triggered by zoom thresholds) to prevent oscillating hierarchy shifts. Camera and known positions persist across expansions within the same mount/snapshot, spawning newly revealed children near their parent.

## Open Follow-ups

- Automatic zoom-driven LOD thresholds with hysteresis (`VIS-03`) and persistence of layout positions across views/snapshots.
- Off-thread physics for small SVG and local neighborhood graphs, comparative WebGPU/Wasm layout benchmarks (`VIS-04`), and reduced-motion/accessibility polish (`VIS-05`).
- Validation details: [Worker Report](validation/2026-10-30/RELATORIO_F8_WORKER.md), [Folders Report](validation/2026-10-31/RELATORIO_F8_PASTAS.md), and [85k-File Graph Report](validation/2026-11-25/RELATORIO_GRAFO.md).
