# F5 — Syntactic Parsing Pilot and Module Resolution

Covers the Tree-sitter syntactic parsing pilot (`syntax.rs`), `tsconfig`/`jsconfig` resolution (`web_resolution.rs`), local Cargo resolution (`cargo_resolution.rs`), Rust module trees (`rust_modules.rs`), and literal `#[path]` attributes.

## Syntactic Extraction

Tree-sitter runs inside `beckarepo-core` for both the desktop app and the CLI, using compiled grammars pinned in `Cargo.lock` (runtime `0.25.10`, JavaScript `0.25.0`, TypeScript/TSX `0.23.2`, Rust `0.24.2`):

- **JavaScript / JSX (`js`, `jsx`, `mjs`, `cjs`) & TypeScript / TSX (`ts`, `tsx`, `mts`, `cts`):** static `import`, `re-export` with source, and `require`/`import` calls with string literal arguments.
- **Rust:** external `mod name;`, inline `mod name { ... }`, local `use` statements (`crate`, `self`, `super`, grouped import trees, and aliases). Resolves target file paths without verifying symbol exports.
- Comments, string literals, and macro token trees are ignored as dependency code; dynamic expressions and unresolved modules generate explicit diagnostics.
- YAML, RSI, Docker, CI, and other languages continue using the bounded Rust regex extractor labeled `regex`.

## Contract & Evidence UI

`syntax.rs` accepts bounded language/content input and emits facts (`module`, `kind`, `scope`, `evidence`), which `parser::Index` resolves against the inventory without any D3 dependency.

- Each node carries `parsing`: engine, version, diagnostics (up to 32 + omitted count), local config path, intra-file Rust import counter, and up to 16 Cargo `targets` (`manifest`, `name`, `kind`, `root`, `module`, capped at 32 KiB + `targetsOmitted`).
- Each edge carries optional `evidence`: engine, UTF-8 byte span `[startByte, endByte)`, 1-based line number, resolution method, and up to 16 `symbols` bindings (name, alias, kind, byte span; strings capped at 120 chars).
- Fields are additive over the v1 graph contract and v2 snapshot envelope. **Overview → Parsing & evidence** displays configuration, resolution rules, bindings, diagnostics, and 20-edge pages. JS/TS self-imports are preserved; intra-file Rust imports are counted without creating cross-file cycles.

## Resolution Rules & Known Limits

### JS / TS Local Configs (`tsconfig.json` & `jsconfig.json`)

The scanner discovers `tsconfig.json` and `jsconfig.json` in the authorized inventory and loads `extends` chains (including JSONC comments, trailing commas, and BOM) strictly within the opened root (never searching `node_modules`).

- Priority selects the nearest directory config (preferring `tsconfig.json` over `jsconfig.json`).
- `paths` supports exact matches and single `*` wildcards (exact match first, then longest prefix before `*`; ties produce diagnostics rather than silent guesses), resolved relative to `baseUrl` or the declaring config directory.
- In TypeScript consumers, attempts `.js → .ts/.tsx/.d.ts`, `.jsx → .tsx/.ts`, `.mjs → .mts/.d.mts`, and `.cjs → .cts/.d.cts` extension substitutions before raw paths.
- Invalid configs, circular inheritance, missing bases, and unsupported `references` disable config resolution with diagnostics while keeping relative imports active.
- Budgets: 256 configs (8 MiB total), 8 bases/file, 16 inheritance levels, 512 config visits, 128 patterns × 8 candidates, 512-byte paths.

### Cargo Manifests, Workspaces & Targets

`cargo_resolution.rs` parses `Cargo.toml` manifests (`toml 0.8.2`) offline without executing `cargo` or build scripts:

- Resolves `[dependencies]` with local `path` pointing to manifests inside the inventory (matching package name, using `[lib].path` or `src/lib.rs` while respecting `autolib = false`), supporting `package` aliases and hyphen-to-underscore normalization.
- Supports `workspace = true` dependencies and `edition.workspace = true` for explicit workspace members (`package.workspace` or nearest ancestor workspace, exact paths and trailing `/*` member/exclude globs).
- `rust_modules.rs` builds a logical module tree from Cargo target roots: library, `src/main.rs`, `src/bin`, `[[bin]]`, `[[example]]`, `[[test]]`, `[[bench]]` (respecting `auto*` flags), and build scripts (`src/bin` is permitted in both scanner policy and Git insights).
- Shared source files keep multiple target contexts and emit edges only when all contexts agree on the target file. Executables/examples/tests/benches can import their own package's library by crate name; build scripts do not receive normal dependencies.
- Requires Rust edition `2018`, `2021`, or `2024`; does not evaluate `extern crate`, optional/dev/build/target-specific dependencies, `patch`/`replace`, `cfg`, `required-features`, or macros.

### Rust `#[path]` Attributes

`rust_modules.rs` and `syntax.rs` resolve literal `#[path = "file.rs"]` on external `mod` declarations and `#[path = "dir"]` on inline `mod` blocks (raw strings, spaces, Unicode, and intervening comments supported):

- Paths must be portable `/` relative paths pointing to `.rs` files inside the authorized inventory (`..` permitted only within the root; absolute paths, Windows drive prefixes, backslashes, and escapes rejected).
- `crate`, `self`, and `super` continue navigating logical module names even when `#[path]` redirects physical directories.
- Duplicate attributes/modules, missing targets, inclusion cycles, `cfg_attr`, and inner `#![path]`/`#![cfg_attr]` conservatively block unsafe inference and emit diagnostics.

## Budgets, Fallback & Cache

- Per-file text cap remains `< 500 KiB`. Tree-sitter uses a cooperative 250 ms timeout callback, and AST fact walking caps at 500 ms and 2,048 facts per file (up to 32 diagnostics, 512-byte module names, 128 MiB aggregate parser metadata).
- Grammar failures or timeouts fall back to `regex-fallback` with diagnostics; syntax errors preserve partial recovered facts.
- Incremental cache (`syntax-v5`) stores compact facts, module summaries, and diagnostics (never ASTs or raw source text) and invalidates when configs, Cargo manifests, or Rust source revisions change.
- Cargo/module budgets: 256 manifests (8 MiB), 128 targets/kind/manifest, 4,096 total targets, 100,000 module entries (32 MiB), up to 64 module segments per context.

## Open Follow-ups

- Expand real-world multi-language precision/recall corpus benchmarks (`AST-05`).
- Support TypeScript project `references`, `package.json` `exports`/`imports`, full `cfg`/features evaluation, and cross-file symbol/re-export resolution.

## References

- [F5 `#[path]` Validation Report](validation/2026-10-29/RELATORIO_F5_PATH.md) · [F6 — External Dependencies](ETAPA_F6.md) · [F7 — Symbols Pilot](ETAPA_F7.md)
- [Tree-sitter Parser API](https://docs.rs/tree-sitter/0.25.10/tree_sitter/struct.Parser.html) · [JS](https://docs.rs/tree-sitter-javascript/0.25.0/tree_sitter_javascript/) · [TS/TSX](https://docs.rs/tree-sitter-typescript/0.23.2/tree_sitter_typescript/) · [Rust](https://docs.rs/tree-sitter-rust/0.24.2/tree_sitter_rust/)
- [TypeScript tsconfig](https://www.typescriptlang.org/tsconfig/) · [TS Module Resolution](https://www.typescriptlang.org/docs/handbook/modules/reference)
- [Rust Reference: Modules](https://doc.rust-lang.org/reference/items/modules.html) · [Cargo Dependencies](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html) · [Workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html) · [Targets](https://doc.rust-lang.org/cargo/reference/cargo-targets.html)
