# Rust Migration Overview

> Historical migration guide for the move from Electron/JS to Tauri 2 and Rust (`beckarepo-core` + `src-tauri`). For phase-by-phase details and current capabilities, see [ROADMAP.md](ROADMAP.md) and [ETAPA_F1.md](ETAPA_F1.md)–[ETAPA_F8.md](ETAPA_F8.md).

## Current Architecture

The desktop application runs on **Tauri 2 and Rust**. Electron, preload scripts, the legacy JS analyzer Worker, and browser-side directory readers have been completely removed with zero JavaScript analysis fallback.

```text
React/D3 → analysisClient → Tauri IPC commands → src-tauri + beckarepo-core
                                                   ├─ filesystem scanning & policy
                                                   ├─ syntax parsing & resolution
                                                   ├─ package, symbol & Git analysis
                                                   ├─ structural metrics & SQLite
                                                   └─ batched snapshot & preview I/O
```

React and D3 handle UI state, tree/panel layout, SVG/Canvas/Dense Canvas rendering, Web Worker force layout, and user interaction. All disk access, native dialogs, session confinement, SQLite persistence, Git queries, and analysis run in Rust.

## Core Layout

| Path | Responsibility |
| --- | --- |
| `crates/beckarepo-core/src/lib.rs` | Public schema types, validation, and contract version (`SCHEMA_VERSION`). |
| `crates/beckarepo-core/src/policy.rs` | Shared file limits, exclusions, and sensitive-filename blocking. |
| `crates/beckarepo-core/src/repository.rs` | Bounded filesystem walk, revisions, incremental snapshots, and search. |
| `crates/beckarepo-core/src/parser.rs` & `syntax.rs` | Tree-sitter syntactic parsing (JS/TS/Rust) and heuristic regex extraction. |
| `crates/beckarepo-core/src/web_resolution.rs` | `tsconfig`/`jsconfig` (`paths`, `baseUrl`, `extends`) resolution. |
| `crates/beckarepo-core/src/cargo_resolution.rs` & `rust_modules.rs` | Cargo manifests/targets/workspaces, logical `mod` trees, and `#[path]` attributes. |
| `crates/beckarepo-core/src/packages.rs` | Offline npm, Cargo, and Maven package graph extraction. |
| `crates/beckarepo-core/src/symbols.rs` | On-demand intra-file symbols, Decisions v1 complexity, and local call graphs. |
| `crates/beckarepo-core/src/analysis.rs` | Shared graph builder, deduplication, and node weighting. |
| `crates/beckarepo-core/src/bin/beckarepo-cli.rs` | Standalone CLI (`v2` directory snapshots and `--json` `v1` compatibility). |
| `src-tauri/src/` | Desktop host, 28 Tauri IPC commands, batched transport, SQLite (`storage.rs`), Git (`git.rs`), and structural metrics (`structure.rs`). |
| `src/services/analysisClient.js` | Frontend IPC client and batched snapshot assembly. |

## Contract & Path Security

- Node paths are normalized `/` relative paths within the authorized root; edge IDs encode `(source, target, type)`.
- Native folder picker and drag-and-drop authorize the root in the host; the UI cannot read arbitrary host paths.
- File content, media assets, and symbol reads verify the active session ID, indexed path membership, canonical confinement, and file revision.
- Symlinks are never followed; known cache, build, and sensitive files/directories are excluded.
- Limits: up to 100,000 files, text `< 500 KiB` per file (`256 MiB` aggregate only in v1 `--json` CLI requests), and media previews up to `128 MiB`.
- Progress and cooperative cancellation apply across scanning, batched IPC, search, Git, and structural metrics.
- Legacy Electron `localStorage` metadata requires explicit export/import via JSON or automatic canonical-root import on open (see [ETAPA_F2.md](ETAPA_F2.md)).

## Running & Building

```powershell
# Development (Vite + native Tauri window)
npm install
npm run dev

# UI-only in browser (analysis requires Tauri desktop window)
npm run dev:vite

# Production build & Windows NSIS installer
npm run build

# Standalone Rust CLI
cargo run -p beckarepo-core --bin beckarepo-cli -- "D:\path\to\repository"
```

The CLI prints a JSON v2 snapshot (metadata, graph, packages, stats, and warnings without raw source code), while `--json` preserves the v1 `AnalysisRequest`/`AnalysisResult` stdin/stdout contract.
