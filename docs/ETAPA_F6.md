# F6 — External Package Dependencies

Implemented 2026-10-29 and consolidated 2026-10-30 (`EXT-01` through `EXT-04`). Adds offline manifest and lockfile readers, package graph entities/edges, direct consumer evidence, indirect impact queries, and UI visualization without running package managers, install scripts, or network requests.

## Ecosystem Coverage

- **npm:** `package.json` (`dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`), npm aliases, subpath imports, local file paths, and explicit workspaces. `package-lock.json` and `npm-shrinkwrap.json` (v2/v3) supply resolved versions and installed dependency edges (mismatched declarations do not receive fabricated resolved versions).
- **Cargo:** `Cargo.toml` declarations, renamed aliases, `normal`/`dev`/`build`/target/optional categories, and `workspace.dependencies` inheritance for explicit members. `Cargo.lock` (v3/v4) maps unique semver-compatible `crates.io` candidates without inventing resolutions for Git, custom registries, `patch`/`replace`, or unevaluated conditions.
- **Maven:** direct dependencies in `pom.xml` (group, artifact, type, classifier, scope, declared version). `dependencyManagement`, parent/BOM, profiles, property interpolation, and Java import-to-artifact resolution remain outside scope; XML DTDs and entities are rejected.
- **Diagnostics:** `yarn.lock`, `pnpm-lock.yaml`, and unsupported lockfile versions emit explicit diagnostics. Absence of a resolved lock version never hides a valid declaration.

## Contract & Interface

`AnalysisResult.packages` extends the v1 contract additively (`nodes`, `edges`, `diagnostics`, `diagnosticsOmitted`). File counts, the file tree, and F4 structural metrics remain strictly file-based. Package nodes carry unique identities per ecosystem, manifest, category, and alias, separate from lockfile entries so multiple resolved versions/locations remain distinct.

- **Edge kinds:** `declares` (manifest → declaration), `imports-package` (source file → declaration with line/byte span), `resolves-to` (declaration → lock entry), and `lock-dependency` (between lock entries). Declaring a package creates no fake file consumers, and transitive lock edges do not imply runtime execution.
- **Desktop transport & UI:** batched across the existing 256-item / 256 KiB IPC limits and committed atomically in `finish_snapshot` (legacy snapshots without `packages` stay compatible). **Analysis → External dependencies** provides filters (name/manifest, ecosystem, status, category), 20-item paging, direct consumers, indirect impact queries, and a 12-edge local neighborhood view (rectangles for packages, circles for files).

## Policy, Cache & Limits

Lockfiles are read in a dedicated pass and never enter the code tree, text search, or file dependency graph. Root confinement, sensitive-path exclusion, pre/post-read revision checks, and final reconciliation apply. `packages/` is permitted in the inventory for monorepo sources, while `node_modules`, `target`, and generated/sensitive directories stay excluded.

- **Input budgets:** `< 500 KiB` per file, 512 documents, 32 MiB aggregate input; XML depth capped at 64.
- **Output budgets:** up to 20,000 package nodes, 100,000 package edges, 64 MiB serialized output, and 128 diagnostics (1,024 chars each + omitted count), with cooperative cancellation across documents, batches, and sources.
- **Caching:** package metadata rebuilds each scan while reusing cached source `imports-package` facts — changing only a lockfile updates resolved versions without re-parsing source files. Uses `quick-xml 0.42.0` and `semver 1`.

## Validation & References

Verified in [validation/2026-10-30/RELATORIO_F6_F7.md](validation/2026-10-30/RELATORIO_F6_F7.md).

- [npm package-lock.json](https://docs.npmjs.com/files/package-lock.json/)
- [Cargo Manifest Format](https://doc.rust-lang.org/cargo/reference/manifest.html)
- [Maven POM Reference](https://maven.apache.org/pom.html)
