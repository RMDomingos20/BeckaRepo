# F5 — Rust `#[path]` Attribute Resolution (2026-10-29)

Follow-up implementing the next roadmap slice after the [2026-10-28 visual check](../2026-10-28/VALIDACAO_VISUAL.md): literal `#[path]` module attribute resolution for Rust. External package mapping (F6) remained unstarted at this stage.

## Functional Summary

Declarations such as `#[path = "../shared/worker.rs"] mod worker;` now resolve to the explicit target file as long as it lies within the authorized repository inventory. The module index also tracks inline module redirections and resolves child modules relative to the redirected directory. `crate`, `self`, and `super` imports continue following the logical target module tree regardless of physical file paths.

The **Parsing & Evidence** panel displays the explicit path rule. Cache versioning moved to `syntax-v5`, so modifying a `#[path]` attribute rebuilds the module index and clears stale links. No JSON/SQLite schema changes or new dependencies were introduced.

Modified files: `syntax.rs`, `rust_modules.rs`, `parser.rs`, and the new integration suite `tests/path_attributes.rs` in `crates/beckarepo-core`, alongside documentation. The draft-warning and image-drag UI fixes from the previous pass were preserved.

## Validation

Tests use synthetic inputs with explicit expected targets in isolated temporary directories. Incremental tests run the real scanner, mutate a `#[path]` attribute on disk, and re-scan. The directory layout corpus is compiled with `rustc --edition=2021 --crate-type=lib --emit=metadata` (without executing any analyzed code) to confirm layout validity against the Rust compiler while verifying the exact set of 16 expected edges.

| New Test | Verified Scope |
| --- | --- |
| Directories & `rustc` | Crate root, standard files, `mod.rs`, redirected inline modules, children of `#[path]`-loaded files, raw strings, Unicode, spaces, comments, and `r#` raw identifiers. Includes decoy files to catch wrong child-directory resolution. |
| Invalid paths | Root escapes, absolute paths, Windows drive letters, missing targets, duplicate attributes, `cfg_attr`, computed expressions, empty/escaped literals, and recursive inclusions produce no false edges. |
| Shared contexts | Shared source belonging to two targets diagnoses divergent resolution instead of guessing one. |
| Inline ambiguity | Duplicate modules, unevaluated conditions, and inner attributes prevent descendants from bypassing blocks. |
| Without Cargo | A `#[path]` declaration does not silently fall back to conventional file paths. |
| Incremental cache | Unchanged re-scans reuse results; changing `a.rs` to `b.rs` removes the old target and invalidates dependent edges. |
| Custom root | Crate entry outside `src/`, physically redirected module, and `crate`/`super` imports preserve all 6 expected targets. |

The full suite passed: **47 Rust tests** (21 host, 15 phases/pipeline, 7 path attributes, 2 contract, 2 CLI) and **5 JavaScript tests**, with zero failures or skipped cases. Host tests used isolated SQLite databases and Git repositories.

Auxiliary benchmarks from this run: the F0/F1 corpus (44,003,000 source bytes) produced a 397,865-byte snapshot in 5,737 ms (initial) and 1,732 ms (incremental). The isolated geometry check processed 85,224 nodes (154 overview markers, 42 zoomed nodes) in 112 ms with 96,748 KiB peak Node RSS (geometry only, not Canvas FPS or desktop RAM).

## Build & Artifacts

`tests/run-validation.ps1 -Build` exited with code `0`, running `cargo fmt --all -- --check`, all Rust and JS tests, full ESLint, and `npm run build` (Rust release build: 1 min 38 s; NSIS x64 installer: ~4.21 MiB). `git diff --check` (CRLF-aware) passed on tracked files.

- Binary: `target/release/beckarepo.exe` (19,622,400 bytes, SHA-256 `3DCE2ED287C086B8FCD9CAE757A8A3ED6D037DE45741D6AB3EBB0912ADE142D7`)
- Installer: `target/release/bundle/nsis/BeckaRepo_1.1.0_x64-setup.exe` (4,411,308 bytes, SHA-256 `5ED35D2DA85E93D4F552090E61E100ACE506ADD6BAAD8623C4A299750596F624`)

## Known Limits & Open Items

- Only existing `.rs` targets inside the authorized inventory with portable `/` relative paths are resolved.
- Escaped string literals, computed path values, inner `#![path]`/`#![cfg_attr]`, macros, `cfg`, and Cargo features are not evaluated (inner attributes conservatively block Rust resolution for that file).
- Links associate files and modules; they do not verify symbol existence/visibility.
- The corpus is synthetic and does not claim full compiler parity across arbitrary repositories.
- No new desktop window run was executed specifically for `#[path]` attributes; UI-level items from [2026-10-28](../2026-10-28/VALIDACAO_VISUAL.md) remained open here.

## Reproduction

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-validation.ps1 -Build -OutputDirectory target/validation/recheck
```

Run only the path-attribute suite:

```powershell
cargo test -p beckarepo-core --offline --test path_attributes -- --nocapture
```

Reference consulted: [Rust Reference — The `path` attribute](https://doc.rust-lang.org/reference/items/modules.html#the-path-attribute). Full coverage details: [ETAPA_F5.md](../../ETAPA_F5.md).
