# Validation Report F0–F5 — BeckaRepo

Date: **2026-10-27** (America/Sao_Paulo). Application version: **1.1.0** (Tauri/Rust migration).

Follow-ups: [Visual Validation (2026-10-28)](../2026-10-28/VALIDACAO_VISUAL.md) and [Rust `#[path]` Attribute Delivery (2026-10-29)](../2026-10-29/RELATORIO_F5_PATH.md). This report records the state and automated results of the 2026-10-27 verification pass.

## Summary

**The automated test suite passed. Full interactive acceptance of the desktop application remained partial at this stage.**

- **40 Rust tests passed** with zero failures or skipped tests: 21 in the desktop host, 15 in the corpus/pipeline suite, 2 contract tests, and 2 CLI/limits tests.
- **5 JavaScript tests passed**, covering UI utilities and dense graph geometry.
- Full-project ESLint and Rust formatting checks passed.
- Production build succeeded: frontend bundle, Rust binary, and Windows NSIS x64 installer (~4.20 MiB). The installer was built and verified on disk, not executed via setup wizard.
- The CLI ran end-to-end analyses against a synthetic fixture and this repository.
- Isolated SQLite databases, Git repositories, a linked worktree, and a local shallow clone were used exclusively for testing.
- **Interactive UI verification deferred:** Live desktop window verification was deferred from this run and completed in the [2026-10-28 visual pass](../2026-10-28/VALIDACAO_VISUAL.md).

All automated checks passed without errors. However, automated coverage alone does not close every roadmap criterion or interactive workflow; remaining visual checks and preparation items for the next milestone are listed below.

## Extended Integration Checks

Six additional Rust tests and two JavaScript tests were added during this pass, bringing the totals from 34/3 to **40 Rust / 5 JavaScript**:

| Added Test | Verified Behavior |
| --- | --- |
| Full snapshot transport | Four sections, multi-batch streaming, rejection of invalid/duplicate IDs and cursors, atomic publish on completion, cancellation blocking publish, and expiration of the prior session. |
| Persistent Git cache | Survives SQLite reopen, keys by HEAD, expires after 7 days, caps at 64 entries, and rejects payloads over 8 MiB. |
| Database restore (healthy DB) | Re-validates pending drafts, restores annotations, preserves safety backup, and invalidates the active session. Exercises the production routine directly. |
| Unavailable DB recovery | Installs a validated backup copy and preserves original corrupted DB bytes and sidecars under `recovery-*`; verified recovered notes. |
| Folder reassociation | Rejects existing/reappeared source folders, unsaved drafts, populated targets, and mismatched source identities; valid moves update in a transaction, preserve notes, and expire the session. |
| Local/staged Git comparison | Distinguishes clean, modified, staged, modified-after-staging, and untracked paths (including brackets in filenames); treats CRLF/LF as different; avoids running external content filters. |
| Geometry and labels | Segments with both endpoints off-screen still render when crossing the viewport; overlapping or out-of-bounds labels are rejected. |
| 85,224-node geometry | All nodes accounted for in overview; clustering produces 154 markers; selected node stays above clusters; zoom preserves selection and returns the expected 42 nodes in region. |

The 85,224-node geometry check took **99 ms** with a peak Node RSS of **104,308 KiB**. This isolates pure geometry and spatial-index math; it does **not** measure Canvas frame time, D3 simulation, WebView rendering, or desktop app memory. Visual legibility of the 91,745 connections in that dataset is tracked separately in [ETAPA_F8.md](../../ETAPA_F8.md) and later [graph validation](../2026-11-25/RELATORIO_GRAFO.md).

Two gaps uncovered while making these routines testable were fixed:

- Database restore now re-checks draft state after dialog confirmation before overwriting data.
- Folder reassociation now re-verifies source directory absence and identity after confirmation.

The extracted internal routines are called directly by the real Tauri commands rather than duplicated in tests. Native dialogs, WebView IPC round-trips, and live mouse/keyboard interactions remained outside automated coverage in this pass.

The production build completed again (Rust release step: 1 min 01 s; NSIS installer: ~4.20 MiB). The isolated test window was closed cleanly after verification attempts.

## Environment and Methodology

- **OS & Hardware:** Windows 11 Home 64-bit (10.0.26100), AMD Ryzen 5 2600.
- **Toolchain:** Rust/Cargo 1.96.0, Node 22.22.2, npm 10.9.7, Git 2.49.0.windows.1 (offline Cargo dependencies).

Tests call production implementations directly across the scanner, resolvers, transport, metrics, Git adapter, and SQLite storage. Annotation writes and imports were factored into shared internal functions used by both Tauri commands and tests, keeping real SQLite transactions intact. JS utility tests run directly in Node without mounting React components or mocking the Tauri bridge.

Verification relied on three layers of evidence:

1. Deterministic unit cases with explicit expected outputs, including deliberate failure modes.
2. Integration tests against the real filesystem, Git subprocesses, CLI binary, and isolated SQLite databases.
3. Build, lint, and desktop launch checks (which do not replace visual inspection).

### Test Isolation

- **Rust fixtures:** `%TEMP%\beckarepo-validation-<case>-<pid>-<timestamp>` (preserved for inspection).
- **UI fixture:** `target/validation/ui-repo`, containing local Git history, Rust modules, TypeScript imports, text files, an image, and a synthetic `.env` excluded by policy.
- **Validation desktop target:** `tests/validation.tauri.json` using app ID `com.beckarepo.validation` and window title **BeckaRepo Validation**.
- **Isolated database:** `%LOCALAPPDATA%\com.beckarepo.validation\beckarepo.sqlite` (73,728 bytes observed). The production database (`com.beckarepo.app`) was never touched. All Git scenarios used local synthetic repos, worktrees, and shallow clones without external network access.

## Phase Coverage Matrix

| Phase | Exercised Evidence | Status and Scope Limits |
| --- | --- | --- |
| F0 — Policy & limits | Sensitive filenames, case/separator variants, absolute/`..` paths, root confinement, out-of-root NTFS junction, 500 KiB text cap, 100,000 files accepted / 100,001 rejected, invalid CLI inputs | **Passed automated scope.** File symlinks could not be created without elevated Windows privileges; directory junction escape was verified instead. Does not exhaustively test all aggregate caps or filesystem race conditions. |
| F1 — Pipeline & content | Source-free snapshots, Unicode/invalid UTF-8 preview, changed revision detection, paginated/canceled search, asset reads, incremental cache, config invalidation, cancellation, retry on disk change (error after 3 unstable passes), expired/foreign sessions, byte/item IPC paging, full host transport cycle | **Passed automated scope.** React mounting, full WebView IPC, stale client responses, and rendering throughput were not exercised here. |
| F2 — Persistence | Schema creation, reopen, notes/tags/preferences, worktree isolation, v1-to-v2 migration on populated DB, revision conflicts, idempotent/atomic JSON import, backup/restore/recovery/rotation/reassociation, corruption/future-version/view rejection, rollback, locking, SQLite quota exhaustion | **Passed automated scope.** Restore, recovery, and reassociation ran against isolated DBs without UI dialogs. Disk-full conditions were simulated via `max_page_count`. |
| F3 — Git | Real repo with known commits, renames with spaces/brackets, frequency/churn, `.git` worktree file, shallow clone, non-Git folder, cancellation/output cap, binary/sensitive/invalid records, cache invalidation, co-change/authorship, mass-commit exclusion, SQLite cache across restart/expiration, local/staged comparison | **Passed automated scope.** Full UI rendering and `AppHandle`/WebView wiring require interactive confirmation. |
| F4 — Structure | Degree, PageRank, and Brandes betweenness on chains with reference values; cyclic SCCs and self-loops; projection with/without inheritance; empty graphs, cancellation, and 300-node sampling | **Passed automated scope.** UI pagination, row selection, co-change overlay, and cycle path expansion were exercised in the later visual pass. |
| F5 — Parser & resolution | JS/TS corpus with JSONC, `extends`, `paths`, extension substitution, `import`/`require`/`re-export`, byte spans; Rust custom targets, inline `mod`, `crate`/`super`, own-crate lib references, workspace/alias dependencies, ambiguity, shared files, raw identifiers; diagnostics for unresolved cases | **Pilot passed on bounded corpus.** Does not equate to full compiler resolution. `#[path]`, `cfg`/macros, symbol/re-export resolution, and external packages remained outside this pass. |

## Measured Results

### F1 — Corpus Volume & Incremental Refresh

Measured in debug profile under normal background machine load:

| Metric | Result |
| --- | ---: |
| Text files in corpus | 1,000 |
| Total source bytes | 44,003,000 |
| Serialized JSON snapshot | 397,867 bytes |
| Initial analysis | 6,559 ms |
| Incremental refresh (no changes) | 1,879 ms |
| Reused file relations | 1,000 files |

The snapshot is ~0.90% of the raw source size, confirming source text is omitted from the snapshot payload. This is not a measure of peak RAM or 85k-node Canvas performance.

### CLI Runs

| Source | Files / Nodes | Edges | JSON Size | Observed Time |
| --- | ---: | ---: | ---: | ---: |
| Local fixture | 9 | 5 | 6,114 bytes | 174 ms |
| This repository (policy-filtered) | 89 | 126 | 124,751 bytes | 2,115 ms |

Verified v2 schema output, absence of `content` fields in inventory entries, `.env` exclusion, and valid endpoints for every edge.

### F3/F4 — Controlled Oracles

- **Rename history:** frequency 3, churn 2, 1 rename recorded.
- **Co-change:** 1 pair with support 2 and conditional probability 1.0 in the fixture; setting mass-commit limit to 1 excludes both commits.
- **Directed chain `a → b → c`:** approximate PageRank `0.18441678` / `0.34117105` / `0.47441217` (sum = 1.0); normalized betweenness for `b` = `0.5`.
- **Two-node cycle + self-loop:** 2 cyclic components with closed witness paths. 300-node sampled mode: 8 deterministic sources, finite results.

### F5 — Corpus Precision

| Corpus | True Positives | False Positives | False Negatives | Precision / Recall |
| --- | ---: | ---: | ---: | ---: |
| JS/TS (3 expected structural edge types) | 3 | 0 | 0 | 1.0 / 1.0 |
| Rust (5 expected file/target links) | 5 | 0 | 0 | 1.0 / 1.0 |

Counted per unique `(source, target, type)` tuple in the synthetic corpus (with additional negative and workspace cases). This does not claim 100% accuracy across arbitrary real-world repositories.

## Issues Found and Fixed

1. **SQLite backups left WAL sidecars outside retention rotation.** Backups inherited WAL mode, and read-only validation created uncounted `-wal`/`-shm` files. New backups now switch to `journal_mode=DELETE` before validation, verified across >5 rotations while protecting restore sources.
2. **Folder names like `__proto__`, `constructor`, and `toString` collided with JS object prototypes.** Tree building now uses null-prototype objects at every level, verified by tests.
3. **Syntax tokenizer could misinterpret placeholder-like text and comment markers inside strings.** Tokenization now preserves original spans verbatim (including NUL/Unicode) without placeholder substitution.
4. **Image preview drag state and tree sorting mutations.** Image preview now isolates pointer capture/release and drag state; tree sorting copies arrays before mutating.
5. **Legacy contract tests enforced exact JSON equality without additive fields.** Updated assertions to allow optional `parsing` and `evidence` fields while preserving default checks.

## How to Reproduce

From the repository root in PowerShell:

```powershell
.\tests\run-validation.ps1 -Build
```

The script stops on failure, writes logs to `target/validation/latest`, and runs:

```powershell
cargo fmt --all -- --check
cargo test --workspace --offline -- --nocapture
node --test tests/ui-utils.test.mjs
npm run lint
npm run build
```

Note: `git diff --check` (with CRLF handling) also passed on all tracked files.

### Build Artifacts

- Binary: `target/release/beckarepo.exe` (19,596,800 bytes, SHA-256 `1753abac1696437c98e4a7d9172a26926971c3b8c47655670b6ebf5c6d5b95a6`)
- Installer: `target/release/bundle/nsis/BeckaRepo_1.1.0_x64-setup.exe` (4,402,740 bytes, SHA-256 `a54b5ee95484e068579af45eef127b3ee2c87c4b2030827f52ba690204a9407c`)
- Non-blocking warnings: macOS `.app` bundle identifier suffix notice and Vite CSS plugin timing notice.

## Follow-up Checklist & Next Deliverable

Remaining items tracked into subsequent passes ([2026-10-28 Visual Validation](../2026-10-28/VALIDACAO_VISUAL.md) and [2026-11-25 Graph Report](../2026-11-25/RELATORIO_GRAFO.md)):

1. Interactive verification of startup, tree/graph/selection, `needle` search, code preview, and image zoom/pan in `BeckaRepo Validation`.
2. Persistent tags/notes/preferences across restart and draft protection.
3. Git history, hotspots, co-change, F4 cycles/metrics, and F5 parsing evidence in the UI.
4. Dialog-driven DB restore, recovery, reassociation, and local/staged comparison.
5. Real-world 85,224-file dense graph rendering and timing measurements.

### Next Planned Slice: Rust `#[path]` Attributes (F5)

Completed in the follow-up [2026-10-29 F5 Path Report](../2026-10-29/RELATORIO_F5_PATH.md):
- Extract literal `#[path]` attributes in the AST into compact module summaries.
- Resolve against root, normal files, `mod.rs`, and inline modules confined to the authorized inventory.
- Diagnose escapes, missing targets, conflicts, and unevaluated `cfg_attr`.
- Bump syntax cache version (`syntax-v5`) and add a `rustc`-verified directory corpus before starting F6.
