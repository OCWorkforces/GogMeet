# GitHub Workflows

CI/release automation for the macOS Electron app. Keep workflow behavior aligned with `package.json`, `.nvmrc`, `scripts/validate-node.mjs`, and packaging guidance in `build/AGENTS.md`.

## Files

| File | Role |
| --- | --- |
| `pr-check.yml` | PR/push validation on `develop` and `main`: quality gates, full and changed-source coverage, and Node 26 icon-drift validation. |
| `beta-release.yml` | Push to `develop` (e.g. after PR merge): packages macOS DMG/ZIP and publishes a **GitHub pre-release** with an auto-incremented beta tag. |
| `release.yml` | Main pushes create a version tag only; the resulting `v*` tag run packages, verifies, and uploads the official release. |

## PR Check

- Runs on `macos-latest`; do not move to Linux unless Swift/EventKit/icon tooling assumptions are replaced.
- Uses pinned `actions/checkout` and `oven-sh/setup-bun` SHAs; keep pins intentional when upgrading.
- The `check` checkout uses `fetch-depth: 0` so a PR can compare with `github.event.pull_request.base.sha` and a push can compare with `github.event.before`. For an initial push with GitHub's all-zero `before` SHA, it resolves `HEAD^` and reuses that resolved base for changed-source coverage.
- `check` runs `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run build`, and one `bun run test:coverage`.
- It lists added, copied, modified, and renamed `src/**/*.ts` files. When the list is nonempty, it runs related tests and a separate text coverage report with Vitest `--coverage.changed`. Soft **main-project** coverage floors live in `vitest.workspace.ts` (lines/statements 60, functions 55, branches 45).
- `validate-node` sets up Bun plus Node from `.nvmrc` (currently 26), runs `bun run validate:node`, then runs `git diff --exit-code` to fail on regenerated tracked icon drift.

## Beta Release (`develop`)

- Triggers on every push to `develop` (including PR merges). Concurrency group `beta-release-develop` serializes runs so beta numbers do not collide.
- Base version is `package.json`’s `X.Y.Z` (any existing `-…` prerelease suffix is stripped for numbering).
- Next tag is `v${BASE}-beta-${N}` where `N` is one greater than the highest existing local/remote tag matching that prefix (e.g. `v1.16.0-beta-1`, `v1.16.0-beta-2`).
- Working-tree `package.json` version is rewritten for the package step only to `${BASE}-beta.${N}` so DMG/ZIP names and About version match; that rewrite is **not** committed.
- A lightweight annotated git tag is pushed, then `softprops/action-gh-release` creates a **pre-release** (`prerelease: true`, `make_latest: false`) with arm64/x64 DMG+ZIP and `SHA256SUMS.txt`.
- **Packaging never auto-publishes via electron-builder** (`--publish never` in `package` / `package:dir`). Releases are uploaded only by `softprops/action-gh-release` with `token: ${{ github.token }}` (do not pass an empty `secrets.GITHUB_TOKEN` override). This avoids electron-builder requiring `GH_TOKEN` during `bun run package`.
- Signing is **optional** for beta:
  - If `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD` are all set → sign, notarize, staple, and run `verify:macos-release`.
  - Otherwise → `CSC_IDENTITY_AUTO_DISCOVERY=false`, package without Developer ID, skip verifier, and note Gatekeeper limits in the release body.
- Official `release.yml` is unchanged: only exact `v${package.json.version}` tags from `main` produce non-prerelease Latest releases.

## Release (`main` / official)

- A `main` push creates and pushes `v${package.json.version}` only when missing. It never installs, packages, verifies, or uploads release assets.
- The resulting `v*` tag run installs with Bun `1.3.14`, requires the tag to match `package.json`, and runs `bun run package` exactly once.
- Before packaging, the tag run fails closed unless `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD` are nonempty. These are the standard Electron Builder signing/notarization variables.
- `bun run verify:macos-release` is a required normal-success gate before checksums and upload. It verifies each contained app from both DMGs and ZIPs, not the container as a stapled artifact.
- The only uploaded containers are deterministic `GogMeet-${version}-{arm64,x64}.{dmg,zip}` files plus `SHA256SUMS.txt`.
- Do not use `-beta-` tags for official releases; beta tags are owned by `beta-release.yml`.
- The official `release` job **ignores** tags containing `-beta-` so develop beta tags never run the production package path.

## Anti-Patterns

- Do not remove `fetch-depth: 0`; the PR check needs base comparisons and the release/beta jobs need tag visibility.
- Do not mark beta pre-releases as `make_latest: true` or omit `prerelease: true`.
- Do not commit the temporary beta `package.json` version bump from CI.
- Do not add custom Apple password variables or a warning-only artifact check on **official** release. Built-in Electron Builder notarization path and the verifier own official-release proof.
- Do not hand-edit generated icons to satisfy workflow drift; regenerate through `scripts/generate-calendar-tray-icons.mjs`.
- Do not duplicate build/package rules here; source of truth remains package scripts plus `electron-builder.yml`.
