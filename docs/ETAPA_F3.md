# F3 — Git History, Persistence, and Project Insights

Implemented 2026-10-26 and expanded with persistent Git identities, SQLite caching, project hotspots, optional authorship, co-change analysis, and local-vs-index byte comparison.

## Project-Wide Git Insights (`Analysis → Project Git`)

In **Analysis → Project Git**, configure the time window, mass-commit file threshold, and minimum pair support. Queries inspect the Git repository containing the opened folder (nested submodules or separate repos inside a parent folder must be opened directly).

- **Bounds:** up to 1,000 non-merge commits (requesting 1,001 to detect truncation), up to 16 MiB `numstat` output, 20,000 paths, and 200,000 candidate pairs. Exceeding bounds returns an explicit error suggesting a narrower window.
- **Mass-commit exclusion:** commits touching more than `10 / 20 / 50 / 100` files (default `50`, counted prior to file-policy filtering) are excluded from both hotspots and co-change calculations. Merge commits and uncommitted changes are excluded.
- **Policy & missing paths:** historical paths respect sensitive-filename rules and excluded directories. Paths absent from the current snapshot render without navigation buttons (since absence may reflect deletion or scanner exclusions).
- **Binaries & renames:** binary changes count toward commit frequency but not line churn. Project-wide queries attribute renames to the destination path without running global `--follow`; per-file history continues using `--follow`.
- **Paging:** hotspots and co-change pairs are sorted and paged in batches of 100 (4 MiB response cap), respecting snapshot/query IDs, cancellation, and the shared 30 s Git queue.

### Hotspot Formula

For each eligible path, `churn = additions + deletions`, `frequency` is the count of eligible commits touching the path, and `age` is the time between the most recent change and the end of the query window:

`score = 100 × [0.45 × ln(1 + churn) / ln(1 + maxChurn) + 0.35 × frequency / maxFrequency + 0.20 × 2^(−ageInDays / 30)]`

Zero-maximum terms evaluate to zero. Maxima are computed across all eligible paths before pagination. The formula and weights are displayed in the UI; the score is relative to the query and never acts as a bug probability or productivity metric.

### Co-Change & Authorship

Each distinct pair of paths counts at most once per commit. Configurable minimum support (`2`, `3`, `5`, or `10`): `P(B|A) = support(A,B) / frequency(A)` and `P(A|B) = support(A,B) / frequency(B)`. Historical co-change lives separately from structural dependencies and never introduces import cycles. Pairs use numeric indices internally to avoid duplicating long path strings.

Authorship is disabled by default. When enabled, `%aN/%aE` normalize via the worktree's `.mailmap` (with `mailmap.file` / `mailmap.blob` overrides disabled). It is not a blame or code-ownership analysis: up to 16 alphabetically sorted identities per path (1 KiB per identity, 8 MiB aggregate) are returned, and queries with authorship bypass persistent caching.

### Persistent Identities & Cache

Schema v2 adds `git_repositories` (canonical common dir), `git_worktrees` (worktree-specific Git dir), `git_scopes` (annotated location + Git root), and `git_cache`. Linked worktrees share repository Git identity while keeping separate worktree identities and leaving F2 annotation keys untouched.

Regenerable cache (`git_cache`, separated from notes): up to 64 entries and 64 MiB payload (8 MiB per entry, 7-day retention). Keys are SHA-256 hashes of worktree dir, scope/path, `HEAD`, limits/algorithm version, aligned time window, and the `shallow` file hash. Corrupt cache payloads log a warning and fall back to fresh queries.

Time windows align to the latest 5-minute boundary (shown explicitly) for session-to-session cacheability; clicking **Refresh Git** bypasses cache while keeping the window alignment. Per-file RAM cache keeps up to 16 histories / 8 MiB.

## Per-File History Usage

1. Open a folder and select a file.
2. Open the **Git History** tab in the details panel.
3. Choose a `7`, `30`, `90`, or `365`-day window (queries run lazily when the tab is opened).
4. **Refresh Git** bypasses query cache; if the file changed on disk since opening, run **Refresh** in the main toolbar first.
5. Clicking **Cancel**, switching files/tabs, or closing cancels obsolete queries.

Requires `git` on `PATH` supporting `--since-as-filter` and `--path-format=absolute`. Missing Git or non-Git folders never block graph exploration. Bare repositories are not treated as code folders.

### Displayed Information

- Current branch or detached `HEAD`, `HEAD` commit hash, and root / Git / common directories.
- Recognizes `.git` directories and worktree `.git` pointer files, including nested repositories and submodules.
- Index presence, staged-change indicator, and byte-level comparison of working file vs. index.
- Exact query window, commit frequency, additions, deletions, churn, and last modified timestamp.
- Commit list with hash, date, line counts, and previous paths detected via `--follow` (50% rename threshold; up to 200 commits displayed, requesting 201 to flag truncation).
- Explicit warnings for shallow clones, commit caps, and records omitted by the sensitive-path policy.

## Adapter Security & Limits

`src-tauri/src/git.rs` spawns `git` directly via `std::process::Command` with separated arguments, absolute executable resolution (excluding the target repo from `PATH` lookup), and hidden console windows on Windows — never via a shell.

- **Read-only commands only:** `rev-parse`, `symbolic-ref`, `ls-files`, cached/raw index diff, and `--numstat` logs. Never writes to the index, config, or working tree.
- **Hardened execution:** ignores global/system config and inherited `GIT_*` overrides; disables pagers, hooks, fsmonitor, credential helpers, external diff, `textconv`, and lazy fetch; blocks remote protocols; scopes `safe.directory` strictly to the discovered root in process args.
- **Safe parsing:** literal pathspecs after `--`, NUL-delimited path output, minimal commit headers (hash + timestamp unless authorship is explicitly enabled), 8 MiB log stdout cap, 64 KiB stderr cap, 4 KiB per historical path, and a 30 s cooperative timeout per query.
- Both `HEAD` and file revision are checked before and after querying.

## Local Comparison, Co-Change Overlay & Moved Folders

- **Local vs. index state:** compares the index blob (`ls-files --stage -z`) against `hash-object --no-filters` (without `-w`), reporting match, modified, untracked, conflict, or unsupported type. Byte-accurate (CRLF/LF differences count; permissions do not).
- **Visual co-change overlay:** checkbox in **Project Git** opens a Canvas drawing the current page's co-change pairs (both endpoints present in inventory) as dashed non-causal lines, with drawn vs. excluded counts visible. Does not alter F4 structural metrics.
- **Moved folder reassociation:** **Settings and data → Local data** lists saved annotation locations for explicit reassociation when a source folder no longer exists and the destination has no saved notes. Native confirmation shows both paths and note count; a safety backup precedes the transaction, preserving original IDs, notes, and tags.

## Open Follow-ups

- Unify historical renames across global project queries and classify deleted files explicitly.
- Extend local status checks to file modes/permissions without executing project content filters.

## Technical References

- [Git log: windows, numstat, NUL, and follow](https://git-scm.com/docs/git-log)
- [Git rev-parse: worktree and directory discovery](https://git-scm.com/docs/git-rev-parse)
- [Git hash-object semantics](https://git-scm.com/docs/git-hash-object)
- [Git follow pathspec implementation](https://github.com/git/git/blob/master/diff.c)
