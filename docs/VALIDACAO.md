# Validation Log — BeckaRepo

Tracks build verification, automated test passes, and interactive desktop validation across the Rust/Tauri rewrite.

## Latest Summary

- **2026-11-25 — Large-Scale Benchmark & Layouts ([RELATORIO_GRAFO.md](validation/2026-11-25/RELATORIO_GRAFO.md)):** End-to-end validation against **85,224 files and 91,744 connections** (`Gaby-CMU`). Rust release scan dropped from 351.21 s to **235.99 s** (-32.8%); Global Graph opened in **2.0 s** across **Galaxy** (214 groups) and **Atlas** (584 groups) with 1,200 overview connections; **63 Rust tests**, **19 JavaScript tests**, ESLint, and Windows NSIS build passed.
- **Current Local Workspace:** **21 JavaScript tests** pass under `node --test tests/*.test.mjs`; **64 Rust tests** registered across the Cargo workspace; Windows NSIS installer built at **4.98 MB** (`BeckaRepo_1.1.0_x64-setup.exe`, compared to 75.9 MB in Electron v1.1.0).

## Validation Index

| Date | Milestone | Automated Suite | Highlights & Artifacts |
| --- | --- | --- | --- |
| **2026-11-25** | [Gaby-CMU Benchmark & Layouts](validation/2026-11-25/RELATORIO_GRAFO.md) | 63 Rust · 19 JS · Lint · Build | 85,224 files / 91,744 edges; Galaxy, Atlas, Free, Folders, Classic, PT/EN Guide. |
| **2026-10-31** | [F8 Folder Drill-Down](validation/2026-10-31/RELATORIO_F8_PASTAS.md) | 63 Rust · 17 JS · Lint · Build | Progressive directory expansion, aggregated edges, individual selection preservation. |
| **2026-10-30** | [F8 Worker Physics](validation/2026-10-30/RELATORIO_F8_WORKER.md) | 63 Rust · 12 JS · Lint · Build | Off-thread D3 force simulation (`denseLayoutRuntime.js`), 85k synthetic benchmark. |
| **2026-10-30** | [F6 Packages & F7 Pilot](validation/2026-10-30/RELATORIO_F6_F7.md) | 63 Rust · 7 JS · Lint · Build | npm/Cargo/Maven inspection, on-demand symbols, complexity, intra-file call graph. |
| **2026-10-29** | [F5 Rust `#[path]` Attributes](validation/2026-10-29/RELATORIO_F5_PATH.md) | 47 Rust · 5 JS · Lint · Build | Literal `#[path]` resolution, inline redirections, `rustc`-checked directory corpus. |
| **2026-10-28** | [F0–F5 Visual Pass](validation/2026-10-28/VALIDACAO_VISUAL.md) | 40 Rust · 5 JS · Lint · Build | Live native window walkthrough, backup/restore, draft guard & image-drag fixes (90.2 MiB peak working set). |
| **2026-10-27** | [F0–F5 Automated Baseline](validation/2026-10-27/RELATORIO_F0_F5.md) | 40 Rust · 5 JS · Lint · Build | Policy confinement, batched IPC, SQLite migrations/recovery, Git/F4/F5 oracles. |

---

## Migration & Phase Chronicle

### Initial Tauri/Rust Migration (2026-10-25)

Replaced Electron (`electron`, `electron-builder`, `main.js`, `preload.js`, JS parser/Worker) with **Tauri 2 + Rust** (`crates/beckarepo-core` + `src-tauri`).

| Check | Outcome |
| --- | --- |
| `npm run build:ui` | Frontend Vite bundle compiled with Tauri IPC integration. |
| `cargo check --workspace --offline` | Rust workspace (engine, CLI, desktop host) compiled cleanly. |
| `cargo fmt --all` | Formatting applied across workspace. |
| `npm run build` | Produced `target/release/beckarepo.exe` and `target/release/bundle/nsis/BeckaRepo_1.1.0_x64-setup.exe` (initial 2.74 MiB installer). |

Note: `electron-to-chromium` may appear as a transitive Browserslist dependency; Electron itself is completely removed. Use `npm run dev` to launch the desktop app (`npm run dev:vite` runs frontend-only in the browser).

### Roadmap Prep & F1 Pipeline (2026-10-25 – 2026-10-26)

- Centralized exclusions, sensitive-path checks, and UTF-8 caps in `policy.rs`.
- Implemented MEM-01–MEM-06: two-pass scanner, source-free v2 snapshots, on-demand `read_file_content` / `read_asset`, paginated native search, cursor-based batched transport (`256 items / 256 KiB`), revision re-verification, and incremental refresh ([ETAPA_F1.md](ETAPA_F1.md)).
- Verified `cargo check --workspace --offline`, targeted ESLint, and NSIS build (2.74 MiB).

### F2 Persistence & F3 Initial Git History (2026-10-26)

- Added bundled SQLite (`rusqlite 0.38`), worktree-scoped tags/notes, `localStorage` / JSON import, 5-slot consistent backups, and restore/recovery ([ETAPA_F2.md](ETAPA_F2.md)).
- Added per-file read-only Git history with 7/30/90/365-day windows, churn, rename tracking, and cancellation ([ETAPA_F3.md](ETAPA_F3.md)).
- Verified `cargo fmt --all`, `cargo check --workspace --offline`, ESLint on new modules, `git diff --check`, and NSIS build (~3.60 MiB).

### Startup Fix & Dense Canvas Introduction (2026-10-26)

- **Startup crash fix (`useTags.js`):** Fixed `Cannot read properties of null (reading 'ready')` on initial render when `load` was `null` and `snapshotId`/`path` were `undefined`, enforcing valid selection and worktree/snapshot/attempt matching before reading readiness or error state.
- **Dense Canvas (`DenseGraphCanvas.jsx`):** Introduced early F8 legibility improvements for large graphs (85,224 files / 91,745 connections), replacing zoom-fading opacity with CSS-pixel sizing, `24×24 px` spatial clustering, edge budgets, spatial-index hit testing, keyboard camera controls, and cleanup on unmount ([ETAPA_F8.md](ETAPA_F8.md)).

### F3 Completion, F4 Metrics & F5 Pilot (2026-10-26 – 2026-10-29)

- **F3 + F4:** Added SQLite schema v2 (`git_repositories`, `git_worktrees`, `git_cache`), project hotspots, co-change pairs with visual overlay, local-vs-index byte comparison, moved-folder reassociation, and Rust structural metrics (iterative Kosaraju cycles, degree, PageRank, exact/sampled Brandes betweenness) in [ETAPA_F4.md](ETAPA_F4.md).
- **F5 Pilot (deliveries 1–5):** Integrated Tree-sitter (`0.25.10`) for JS/JSX/TS/TSX/Rust (`syntax-v1` → `syntax-v5`), `tsconfig`/`jsconfig` resolution (`paths`, `baseUrl`, `extends`), Cargo workspaces and target roots, logical Rust module trees, and literal `#[path]` attributes ([ETAPA_F5.md](ETAPA_F5.md)).
- Consolidated automated test suites across 2026-10-27 (40 Rust / 5 JS), 2026-10-28 (live visual pass), and 2026-10-29 (47 Rust / 5 JS).

### F6, F7 & F8 Expansion (2026-10-30 – 2026-11-25)

- Delivered [ETAPA_F6.md](ETAPA_F6.md) (npm/Cargo/Maven external dependencies), [ETAPA_F7.md](ETAPA_F7.md) (on-demand symbols, complexity, intra-file calls), and [ETAPA_F8.md](ETAPA_F8.md) (Worker physics + Folder drill-down), followed by Galaxy/Atlas layouts and the 85k-file benchmark in [RELATORIO_GRAFO.md](validation/2026-11-25/RELATORIO_GRAFO.md).

## Running the Full Validation Suite

```powershell
.\tests\run-validation.ps1 -Build
```

Runs `cargo fmt --all -- --check`, `cargo test --workspace --offline`, JavaScript tests (`tests/*.test.mjs`), `npm run lint`, and `npm run build` (Windows NSIS installer). See [ROADMAP.md](ROADMAP.md) for open backlog items and future milestones.
