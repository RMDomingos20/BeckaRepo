# File Policy and Safety Limits

Implemented in `crates/beckarepo-core/src/policy.rs` and shared across the filesystem scanner, on-demand content/media readers, package manifest readers, and `--json` request validator.

## Selection & Sensitive-Path Exclusions

- **Monorepo packages:** `packages/` is inventoried so monorepo source files are analyzed. Lockfiles (`package-lock.json`, `npm-shrinkwrap.json`, `Cargo.lock`) are read in a dedicated bounded pass for package analysis and excluded from the code tree, text search, and file dependency graph (`yarn.lock` and `pnpm-lock.yaml` emit unsupported-format diagnostics).
- **Sensitive filenames:** Evaluated case-insensitively on every path component across `/` and `\` separators (normalizing trailing spaces/dots):

| Rule | Excluded Examples |
| --- | --- |
| `.env`, `.env.*` prefix, or `*.env` suffix | `.env`, `.env.production`, `.env.example`, `production.env` |
| Known credential files & directories | `.ssh`, `.aws`, `.azure`, `.kube`, `.gnupg`, `.npmrc`, `.pypirc`, `.netrc`, `_netrc`, `auth.json` |
| Sensitive key/certificate extensions | `.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore` |
| Exact names or prefixes before `.` | `credentials`, `secrets`, `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519` (e.g., `credentials.json`, `secrets.yaml`) |
| Service account prefixes | `service-account*`, `service_account*` |

**Conservatively strict by design:** sample files, public keys, or directories matching these names (such as an entire `secrets/` folder, or selecting a sensitive folder directly as the root) are excluded.

- Exclusions run **before** opening file contents in the scanner.
- On-demand text (`read_file_content`) and media (`read_asset`) reads additionally verify canonical path confinement within the opened root.
- Symlinks are not traversed.
- JSON `--json` requests containing any sensitive path are rejected before parsing, even when `content` is `null`.

**Known boundaries:** This policy is a preventive filename/path barrier, not a universal secrets scanner — tokens inside ordinary files (e.g., `config.js`), unlisted filenames, hardlinks, or concurrent filesystem races require external secret scanning, and stdin JSON bytes enter memory prior to validation.

## Resource Limits

| Resource | Limit | Behavior on Exceed |
| --- | --- | --- |
| Accepted files | `100,000` | Fails explicitly in both directory scanner and JSON requests. |
| Text content per file | `< 500 KiB` (512,000 bytes) | Scanner keeps metadata node without text; JSON request fails. |
| Aggregate UTF-8 text (`--json` v1) | `256 MiB` | Fails explicitly (folder scan drops each file's text after extraction). |
| Media preview | `128 MiB` | Bounded read; returns an error if exceeded. |
| CLI `--json` stdin request | `320 MiB` | Bounded read prior to deserialization. |

Text byte counting measures post-conversion UTF-8 bytes; if a file grows on disk during reading and hits the cap, partial prefixes are discarded rather than parsed. Additional memory budgets apply to graphs (`500,000` entries / `128 MiB`), packages (`20,000` nodes / `100,000` edges / `64 MiB`), structural analysis (`100,000` nodes / `500,000` edges), and batched IPC (`256` items / `256 KiB` per batch).

## Impact on Search & Export

Files excluded by policy never enter snapshots, full-text search, or the file tree exported to Markdown. See [Architecture](ARQUITETURA_ROADMAP.md) and [ROADMAP.md](ROADMAP.md) for snapshot v2 and transport details.
