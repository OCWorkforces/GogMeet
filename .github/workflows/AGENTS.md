# GitHub Workflows

CI/release automation for the Electron app (macOS + Windows). Keep workflow behavior aligned with `package.json`, `.nvmrc`, `scripts/validate-node.mjs`, and packaging guidance in `build/AGENTS.md`.

## Files

| File | Role |
| --- | --- |
| `pr-check.yml` | PR/push validation on `develop` and `main`: quality gates on macOS + Windows, full and changed-source coverage, and Node 26 icon-drift validation (mac only). |
| `release.yml` | Main pushes create a version tag only; the resulting `v*` tag run packages, verifies, and uploads the official release (mac today; Windows release job is Wave 7). |

## PR Check

- `check` matrix: `macos-latest` and `windows-latest` (K31 — no `windows-11-arm`; arm64 Windows packages are cross-built later on x64 runners).
- Defaults to `shell: bash` so changed-files scripts stay portable on Windows runners.
- Uses pinned `actions/checkout` and `oven-sh/setup-bun` SHAs; keep pins intentional when upgrading.
- The `check` checkout uses `fetch-depth: 0` so a PR can compare with `github.event.pull_request.base.sha` and a push can compare with `github.event.before`. For an initial push with GitHub's all-zero `before` SHA, it resolves `HEAD^` and reuses that resolved base for changed-source coverage.
- `check` runs `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run build`, and one `bun run test:coverage`.
- It lists added, copied, modified, and renamed `src/**/*.ts` files. When the list is nonempty, it runs related tests and a separate text coverage report with Vitest `--coverage.changed`; there are no coverage percentage thresholds.
- `validate-node` remains **macos-latest only** (iconutil / icns). Sets up Bun plus Node from `.nvmrc` (currently 26), runs `bun run validate:node`, then `git diff --exit-code` for icon drift including `build/icon.ico` and Windows tray PNGs.

## Release

- A `main` push creates and pushes `v${package.json.version}` only when missing. It never installs, packages, verifies, or uploads release assets.
- The resulting `v*` tag run installs with Bun `1.3.14`, requires the tag to match `package.json`, and runs `bun run package` exactly once.
- Before packaging, the tag run fails closed unless `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD` are nonempty. These are the standard Electron Builder signing/notarization variables.
- `bun run verify:macos-release` is a required normal-success gate before checksums and upload. It verifies each contained app from both DMGs and ZIPs, not the container as a stapled artifact.
- The only uploaded containers are deterministic `GogMeet-${version}-{arm64,x64}.{dmg,zip}` files plus `SHA256SUMS.txt`.

## Anti-Patterns

- Do not remove `fetch-depth: 0`; the PR check needs base comparisons and the release job needs tag visibility.
- Do not add custom Apple password variables or a warning-only artifact check. Built-in Electron Builder notarization and the verifier own official-release proof.
- Do not hand-edit generated icons to satisfy workflow drift; regenerate through `scripts/generate-calendar-tray-icons.mjs`.
- Do not duplicate build/package rules here; source of truth remains package scripts plus `electron-builder.yml`.
