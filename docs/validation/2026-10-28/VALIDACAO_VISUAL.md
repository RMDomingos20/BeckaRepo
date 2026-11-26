# Visual Validation F0–F5 — 2026-10-28

Follow-up to the [automated validation report (2026-10-27)](../2026-10-27/RELATORIO_F0_F5.md). Interactive testing ran in the isolated native **BeckaRepo Validation** window (`tests/validation.tauri.json`, WebView2, 1280 × 800) against the isolated `com.beckarepo.validation` SQLite database without touching production data.

## Observed Behavior

| Workflow | Observed Result |
| --- | --- |
| Startup & native folder picker | Initial screen loaded cleanly; selected `target/validation/ui-repo`; analysis and batched transfer completed with 9 files and 5 edges (`.env` excluded). |
| Tree & details panel | Expanded `src` and selected `alpha.rs`; showed outbound import to `beta` and inbound consumers `beta`/`lib`. |
| On-demand code view | Preview rendered `use crate::beta::Beta;`, `pub struct Alpha;`, and commit comments. |
| Local neighborhood graph | Rendered 3 nodes (`alpha`, `beta`, `lib`) and directed edges without errors. |
| Annotations | Saved note `Validação visual 28/10: nota persistente.` and tag `validacao-visual`; save/discard buttons disabled cleanly and status updated to saved. |
| Draft guard | Refresh was blocked while edits remained unsaved. Fixed a stale warning that persisted after saving by decoupling it from load errors and clearing it with the draft session; re-verified below. |
| Git history | Branch `validation`, HEAD `148f8032103b`, 2 commits, churn 3 (+3/−0), local file matching index. |
| Project hotspots | Listed 9 files; `alpha`/`beta` showed 2 commits and churn 3; 1 policy-excluded path flagged. |
| Co-change | Lowered minimum support from 3 to 2; displayed `alpha`/`beta` pair with support 2 and 100% conditional probability in both directions. Overlay rendered the two nodes linked by a dashed edge. |
| F4 structural metrics | 9 nodes, 5 edges; PageRank converged in 36 iterations (residual `8.593e-9`); `alpha`/`beta` showed in-degree 2, out-degree 1. Combined Git view showed churn 3 and 2 commits. |
| Cycles | Found 1 cyclic component of 2 files; expanding revealed `alpha → beta → alpha`. |
| Text search | Query `needle` matched `README.txt` (9/9 files scanned, 8 text files, 1 non-text asset, 0 errors/changes). Search result node highlighted in graph. |
| Persistence across restart | Reopening the app and selecting the same folder restored the saved note and tag. Switching UI language to English, closing, and relaunching preserved the English preference. |
| Draft guard re-test | Edited note, attempted Refresh (blocked with warning), clicked Save: warning cleared immediately and status returned to saved. |
| F5 parsing evidence | Expanded panel displayed `syntax-v4`, `Cargo.toml`, target `validation_demo/lib`, root `src/lib.rs`, context `crate::alpha`, and import `crate::beta::Beta → src/beta.rs` (line 1, bytes `[0,22)`). |
| Image preview | Loaded `preview.png`; mouse-wheel zoom and pan worked. Fixed accidental blue text-selection highlight during drag using `userSelect: none` and `preventDefault` on `pointerdown`; re-tested cleanly. |
| Native backup | Clicking **Create backup** wrote `com.beckarepo.validation/backups/beckarepo-1793211592254095200.sqlite` and displayed its path. Selecting it opened the confirmation prompt. |
| Database restore | Confirmed restore reloaded WebView to the home screen and reverted language preference from English back to Portuguese (with an extra safety backup created in the directory). Production DB `com.beckarepo.app` remained untouched. |
| Cancellation under load | Opened `Gaby-CMU-master`, triggered Cancel during scanning, and returned cleanly to the home screen with no errors; subsequent folder selection worked normally. |

All results above were observed directly in the running native WebView window rather than inferred from unit tests.

Across 60 sampled process intervals during the session, peak working set for the BeckaRepo process reached **90.2 MiB**.

## Status & Remaining Checks

**Interactive acceptance remained partial at this milestone.** After database restore, reopening the project to inspect restored annotation text, UI-driven corrupted DB recovery, folder reassociation dialogs, multi-page pagination, and full rendering benchmarks on the 85,224-file repository (`Gaby-CMU-master`) remained open (later tested in [2026-11-25 Graph Report](../2026-11-25/RELATORIO_GRAFO.md)).

Following the two UI fixes (draft warning state and image drag selection), ESLint, frontend production build, and all 5 JavaScript tests passed (isolated geometry test: 108 ms). No Rust code was modified in this pass.

Next milestone: [F5 Rust `#[path]` Attribute Report](../2026-10-29/RELATORIO_F5_PATH.md).
