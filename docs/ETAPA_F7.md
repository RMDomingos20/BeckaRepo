# F7 — On-Demand Symbols and Intra-File Navigation

Initial pilot implemented 2026-10-30 (`SYM-01`, `SYM-02`, `SYM-04`, `SYM-05`, and partial `SYM-03`) for JavaScript/JSX, TypeScript/TSX, and Rust. Cross-file symbol resolution, type inference, and inter-file call graphs remain outside this phase.

## Usage & Identity

Select a supported file and open the **Symbols** tab in the details panel. Extraction runs lazily in Rust (`file_symbols`) only when the tab is opened, offering name filtering, cyclomatic complexity/decision breakdowns, call lists, symbol code previews, and an expandable local symbol graph (preserving selection on collapse and supporting zoom).

- Up to 40 symbols per page and 80 resolved call edges in the graph; unresolved calls stay listed without target edges. Code previews use UTF-8 byte offsets capped at 24 KiB with explicit truncation notices.
- Identities combine file path, revision, extractor version (`symbols-v1/decisions-v1`), qualified name, and `[startByte, endByte)` span (1-based lines). Covers functions, methods, classes, interfaces, structs, enums, traits, modules, and named types per grammar (anonymous functions include line/column; simple variable-assigned functions use the variable identifier).
- IDs are revision-scoped and never act as permanent note anchors. `file_symbols` enforces session authorization, bounded file reads, and post-parse revision verification; stale renderer responses are discarded, and no ASTs or sources enter the global snapshot cache.

## Call Resolution & Coverage

Resolved intra-file edges require a simple-identifier call targeting a unique declared function in an ancestral lexical scope within the same file. Parameters, local bindings, imports, or assignments sharing the same name conservatively suppress resolution across the file. Methods/receivers, qualified paths, dynamic calls, constructors, imports, and external symbols are never guessed by name matching, and syntax errors or partial parses disable resolved call edges.

These edges reflect observed lexical links, not runtime execution, dynamic dispatch, `cfg`/features, or macros (`impl`/trait methods are not linked as free functions).

**"No known local calls"** is explicitly presented as a file-scoped observation: exported items, public visibility, and probable Rust `main` entrypoints are flagged conservatively without dead-code claims or automated deletion hints.

## Decision Complexity v1

Each function starts at `1`, adding `+1` for `if`, `for`/`while`/`do` with condition, `catch`, ternary, `switch` `case`, `&&`/`||`, and Rust `?` propagation; Rust `match` adds `arms − 1`. Comments, strings, and macro token trees are ignored. Nested functions are scored independently, and classes/interfaces/types do not receive function complexity scores.

The panel lists each contributing rule, line number, and byte span as a transparent versioned syntactic metric.

## Limits & Validation

- `< 500 KiB` source cap; cooperative timeouts of 250 ms for parsing and 750 ms for extraction; up to 1,024 symbols, 2,048 calls, 64 scopes, 128 decision evidences per function, 32 diagnostics (+ omitted counts), and 2 MiB serialized response. Unsupported languages and partial parses appear as explicit states.
- No new dependencies, database migrations, or analyzed-code execution. See [validation/2026-10-30/RELATORIO_F6_F7.md](validation/2026-10-30/RELATORIO_F6_F7.md).
