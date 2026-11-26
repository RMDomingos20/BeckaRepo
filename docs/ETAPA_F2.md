# F2 — Local Persistence and Annotations

Implemented 2026-10-26. Covers bundled SQLite storage, worktree-scoped tags and notes, draft handling, legacy imports, backups, and database recovery.

## Usage

1. Launch the app (`npm run dev` or compiled executable) and open a project folder.
2. Select any file and expand **Overview → Tags and notes** to add tags, write notes, and click **Save**.
3. Unsaved drafts remain in memory across file or tab switches; the **Drafts** bar lets you jump back to edited files and warns before refreshing, switching folders, or closing with unsaved edits.
4. Open **Settings and data → Local data** (also reachable from the start screen) to view the database path, create backups, or restore an existing backup.
5. **Refresh** reconciles the folder inventory and reuses valid relations while preserving the selected file if it still exists.

Note: unsaved drafts live in memory until saved; force-terminating the process drops unsaved drafts.

## Database & Identity Model

- Powered by `rusqlite 0.38` with bundled SQLite (no external SQLite installation required).
- Stored as `beckarepo.sqlite` inside Tauri's `app_local_data_dir` (e.g., `%LOCALAPPDATA%\com.beckarepo.app\beckarepo.sqlite` on Windows) — never written into the analyzed repository.
- Uses schema version 2 (following F3 additions), tracked via `application_id`, `user_version`, and `schema_migrations`. Creation and `v1 → v2` migrations run transactionally; higher unknown schema versions are rejected, and a startup backup precedes any migration (both v1 and v2 backups can be restored).
- Persistent random 128-bit IDs identify repositories and worktrees; `locations` maps canonical paths to worktrees, and annotations are keyed by `(worktree_id, path)`.
- Each new directory starts with its own annotation identity. F3 links Git identities in separate tables without merging annotations. Explicit moved-folder reassociation is available in **Local data** with native confirmation, pre-transaction backup, and safety checks (see [ETAPA_F3.md](ETAPA_F3.md)).
- **Core tables:** `repositories`, `worktrees`, `locations`, `annotations`, `tags`, `annotation_tags`, `preferences`, `imports`, and `schema_migrations` (plus F3's `git_repositories`, `git_worktrees`, `git_scopes`, and `git_cache`).
- Source text, search hits, and dependency graphs are never persisted to SQLite.
- Persisted preferences include UI language, panel visibility, accent color, and spacing.
- Saves verify a numeric revision inside a transaction; conflicts return an error without discarding drafts, and **Reload saved data** refreshes persisted state without wiping local edits. Annotations for deleted files stay in the database (an orphaned-notes browser remains on the roadmap).

## Import & Legacy Migration

On project open, `useTags` automatically imports matching `localStorage` entries (`beckarepo_tags_<canonical_root>`) as well as prior language preferences if none exist in SQLite. Source `localStorage` entries are left intact.

For legacy Electron profiles or folder-name-keyed exports, export your annotation map to JSON and use **Settings and data → Import JSON notes** while the target project is open:

```json
{
  "src/main.rs": {
    "tags": ["entrypoint", "review"],
    "note": "Check startup flow."
  }
}
```

- **Caps:** up to 4 MiB JSON and 2,000 entries per import.
- **Paths:** normalized relative paths; sensitive, absolute, or `..` paths are rejected.
- **Content:** notes up to 64 KiB UTF-8; up to 32 distinct tags per file (up to 80 UTF-8 bytes each; empty, control-character, or leading/trailing-space tags rejected).
- **Idempotency:** validation runs before starting the transaction; existing annotations are preserved (missing entries only), and manual imports are deduplicated by JSON SHA-256 hash. Invalid JSON reports an error in the panel without disturbing saved annotations.

## Backups, Recovery, and Limits

- Consistent live backups use SQLite's online backup API via `rusqlite` with bounded steps and a 30-second cooperative deadline.
- An automatic backup runs at startup before edits; manual backups capture the current committed state (excluding unsaved drafts).
- Retention keeps the 5 newest `backups/beckarepo-<timestamp>.sqlite` files in the app data directory, protecting the active source file during restore rotation.
- Restoring prompts for a file and native confirmation, validates identity, schema version, integrity, foreign keys, and tables, creates a safety backup before swapping, closes any open repository session, and reloads the UI.
- If the main database cannot be opened on startup, recovery validates a backup copy, moves the original database and sidecars aside into `recovery-<timestamp>/` (not auto-pruned by retention), and installs the validated copy.
- Uses WAL mode, foreign keys, `FULL` synchronous writes, a 2 s busy timeout, and an approximate 256 MiB page cap (`max_page_count`). Disk-full, lock contention, and corruption return explicit errors; persistence initialization failures still allow read-only graph exploration with a warning.
- The SQLite file and backups are unencrypted; the scanner's sensitive-filename policy does not inspect manually typed notes.

## Open Follow-ups

- UI for browsing orphaned notes of deleted files and clean-machine installation verification.
