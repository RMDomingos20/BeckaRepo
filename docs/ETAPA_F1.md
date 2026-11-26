# F1 — On-Demand Content, Batched Transport, and Incremental Refresh

Implemented 2026-10-26 (`MEM-01` through `MEM-06`).

## Overview

- The scanner inventories metadata, relative paths, and file revisions (size + mtime).
- An initial pass reads only the files needed for YAML/RSI identifier indices, retaining compact IDs rather than full source text.
- Relation extraction loads, parses, and drops one file at a time. The v1 JSON analyzer (`--json`) reuses the same graph builder.
- Folder snapshots use **v2** envelopes (`schemaVersion`, `snapshotId`, `repositoryId`, `name`, `files`, `graph`, `warnings`, `changes`). Each entry in `files` carries `path`, `name`, `size`, `revision`, and `contentState` — never `content`.
- The nested `graph` object retains the **v1** node/edge contract so existing graph consumers remain compatible.
- `read_file_content` reads text on demand only when inspected in the file panel. Media previews (`read_asset`) likewise verify the active session and current file revision.
- `search_repository` performs case-insensitive literal search across snapshot paths and eligible text files without accepting arbitrary regex patterns.
- The frontend discards stale responses from superseded file selections or searches. Starting a new query, closing, or switching repositories cancels obsolete background work.

## Commands and Limits

| Command | Input | Output |
| --- | --- | --- |
| `read_file_content` | `snapshotId`, `path` | `status`, `revision`, optional `content` |
| `read_asset` | `snapshotId`, `path` | Verified byte slice within size and revision bounds |
| `search_repository` | `snapshotId`, `queryId`, `query`, `cursor`, `limit` | Hits, next cursor, and batch coverage |
| `cancel_search` | `queryId` | Cancels only the matching search query |

The backend session retains metadata, the dependency graph, derived relations, and the authorized path list. Client-supplied IDs cannot authorize arbitrary filesystem roots. Search pagination binds each cursor to its query and session rather than maintaining a persistent index.

- **Per-file text limit:** strictly below 500 KiB (including UTF-8 conversion output).
- **Corpus cap:** up to 100,000 files; media previews up to 128 MiB.
- **Search:** minimum 2 characters; capped at 512 bytes in the backend and 128 UTF-16 code units in the UI input.
- **Native search page:** scans up to 256 files and returns up to 200 matching files per page (at most 1 hit per file, first matching line, snippet up to 240 characters).
- **UI search paging:** fetches pages until reaching 200 matches or end of repo; "Load more results" fetches another 200 up to a 2,000-match cap (connected context nodes do not count toward this cap).
- **Coverage stats:** displays scanned files, searched text files, unsearched files, revision changes, and read errors. Filename hits still appear even if file contents could not be searched.
- **Queues:** search and file preview run on separate single-flight queues in the host. File text is never stored in a global cache; only the active panel preview is held in memory.

While `--json` v1 requests keep the 256 MiB aggregate input cap, folder scanning no longer retains all file texts simultaneously. Graph and relation caches each enforce caps of 500,000 entries and 128 MiB of strings, failing explicitly if exceeded.

## File Changes on Disk

Text reads compare file size and mtime before and after reading. At the end of analysis, the scanner re-verifies file revisions; detected changes trigger up to 3 total inventory retries before returning an error without replacing the active session. Read failures emit warnings and skip caching for affected files.

Clicking **Refresh** runs a fresh inventory: if YAML/RSI provider paths and revisions are unchanged, cached indices and relations for unmodified files are reused while modified files are re-parsed. Added/removed paths or changed ID providers invalidate global resolution and rebuild relations. Structural relations and node weights are always recomputed. `changes` reports `parsed`, `reused`, `added`, and `removed`.

Note: there is no background filesystem watcher, polling, or content hashing; on-disk changes preserving both size and mtime require a manual refresh to reconcile.

## Desktop Transport

`open_repository` accepts `analysisId`, an optional authorized folder, or `refreshSnapshotId` for the active session, returning a manifest with counts rather than full collections. Progress events carry `analysisId` so the UI ignores stale events.

The frontend requests `snapshot_batch` sequentially across files, nodes, edges, and warnings using `snapshotId`, `analysisId`, section, and cursor. Each batch holds up to 256 items and 256 KiB (reserving envelope overhead); single items exceeding the budget fail explicitly. The producer advances only as each cursor is requested.

After validating all batches, the client calls `finish_snapshot` to atomically swap the active session and invalidate stale reads/searches. Cancellation or errors discard the pending snapshot while preserving any active session during a refresh.

Desktop manifests also expose SQLite identities (`repositoryId`, `worktreeId`, and `legacyKey` for annotation migration). The standalone CLI does not use SQLite and identifies folders by canonical root path.

## CLI Compatibility

```powershell
cargo run -p beckarepo-core --bin beckarepo-cli -- "D:\path\to\repository"
```

Directory scans output **v2 snapshots without raw source text**. `--json` mode continues accepting `AnalysisRequest` v1 on stdin and returning `AnalysisResult` v1 under the shared file policy.

## Open Follow-ups

- Hard parser execution deadlines alongside cooperative cancellation.
- Optional filesystem watching and content-hash invalidation if needed in future releases.

## Primary Files

- `crates/beckarepo-core/src/repository.rs` — inventory, bounded reads, snapshots, and search
- `crates/beckarepo-core/src/parser.rs` — incrementally fed identifier index
- `crates/beckarepo-core/src/analysis.rs` — shared graph builder with per-file loader
- `src-tauri/src/main.rs` — path authorization, sessions, and cancellation
- `src-tauri/src/transport.rs` & `src/services/analysisClient.js` — manifest, batched IPC, and commit
- `src/hooks/useRepositorySearch.js` — pagination and stale-response discarding
- `src/components/FilePanel.jsx` — on-demand code and media inspection
