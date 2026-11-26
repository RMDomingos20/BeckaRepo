# Validation F6 & F7 Pilot — 2026-10-30

Covers [F6 — External Dependencies](../../ETAPA_F6.md) and the [F7 — Symbols Pilot](../../ETAPA_F7.md) for JS/TS/Rust. `SYM-03` remained partial here: local lexical call resolution does not provide cross-file symbol, type, or call resolution.

## Automated Validation

Ran `tests/run-validation.ps1 -Build -OutputDirectory docs/validation/2026-10-30/f7-logs` using isolated test databases and repositories without touching production storage.

| Check | Result & Evidence |
| --- | --- |
| Rust workspace (offline) | **63 passed**, 0 failed: 22 host, 2 CLI, 2 contract, 8 packages, 7 Rust paths, 15 prior phases, 7 symbols. |
| JavaScript utilities | **7 passed**, 0 failed: legacy/current package contract, indirect impact cycles, folder tree, Unicode text, and 85,224-node geometry. |
| Rust formatting | `cargo fmt --all -- --check` passed. |
| ESLint | Zero errors across the codebase. |
| Release build | Vite bundle, Rust release executable, and Windows NSIS 1.1.0 x64 installer (~4.29 MiB) built cleanly (not executed). |

F6 had also passed an earlier run with 55 Rust / 7 JS tests; this suite supersedes that pass.

F7 tests verify decision scoring rules, nested functions, recursion, lexical shadowing, dynamic calls (no guessed edges), Unicode/UTF-8 byte spans, revision-bound identities, TSX, syntax errors, macros/strings/comments, cancellation, and size/time limits. The host rejects missing files, out-of-root paths, changed revisions, and expired sessions.

## Native UI Acceptance

Verified in the isolated **BeckaRepo Validation** window (`npm run tauri -- dev --config tests/validation.tauri.json --no-watch`, ID `com.beckarepo.validation`) against the local fixture `target/validation/f6-ui-repo` (`package.json`, `package-lock.json` v3, two TypeScript sources, and `symbols.rs`).

| Observed Scenario | Result |
| --- | --- |
| F6 list (28 declarations) | Paginated cleanly (`1/2` and `2/2`, 20 items per page). |
| Aliases & versions | Displayed `alias → real` at `1.2.0` and `@scope/lib` at `3.0.0`. |
| Unimported declaration | `unused` showed declared `^2` and lock `2.0.0` with zero consumers; `declares` and `resolves-to` edges remained distinct. |
| F7 symbol extraction | Extracted 4 symbols (`ação`, `auxiliar`, `sem_chamadas`, `main`) and 2 resolved local calls. |
| Complexity scoring | `ação=3`, `auxiliar=2`, `sem_chamadas=1`, `main=1`; public visibility and potential entrypoint flagged. |
| Unicode source spans | `ação` located at lines 2–4, UTF-8 bytes `[46,122)`, with readable preview and decision evidence. |
| Symbol graph | Rendered `main → auxiliar → ação` with `sem_chamadas` isolated. Adjusted layout from 4 columns to 2 columns to fit cleanly inside the 380 px side panel. |
| Zoom / collapse | Zoom tested from `1` to `1.5`; collapsing returned to the list view (post-collapse selection persistence remained unverified visually). |

## Scope Limits

Not visually verified in this pass: zero-calls filter toggle, 40-symbol pagination, all supported language constructs, indirect consumer views in UI, auto-navigation to F6 detail, and clean-machine installer execution (indirect impact logic is covered by automated tests). The 85,224-node check remained synthetic geometry only.

Prior items from [2026-10-28 Visual Validation](../2026-10-28/VALIDACAO_VISUAL.md) remained tracked separately. Subsequent work proceeded to [F8 Worker Physics](RELATORIO_F8_WORKER.md), which overwrites the shared output paths under `target/release/`.
