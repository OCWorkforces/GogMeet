# GitHub Workflows

CI/release automation for the Electron app (macOS + Windows). Keep workflow behavior aligned with `package.json`, `.nvmrc`, `scripts/validate-node.mjs`, and packaging guidance in `build/AGENTS.md`.

## Files

| File | Role |
| --- | --- |
| `pr-check.yml` | PR/push validation on `develop` and `main`: quality gates on macOS + Windows, full and changed-source coverage, and Node 26 icon-drift validation (mac only). |
| `release.yml` | Main pushes create a version tag only; `v*` tags run parallel `release-mac` and `release-win` jobs that package, verify, and upload to the same GitHub Release. |
| `beta-release.yml` | Push to `develop` (e.g. after PR merge): packages macOS DMG/ZIP and publishes a **GitHub pre-release** with an auto-incremented beta tag. |

## PR Check

- `check` matrix: `macos-latest` and `windows-latest` (K31 — no `windows-11-arm`; arm64 Windows packages are cross-built later on x64 runners).
- Defaults to `shell: bash` so changed-files scripts stay portable on Windows runners.
- Before checkout, sets `core.autocrlf=false` / `core.eol=lf` so Windows runners keep LF. Pair with repo-root `.gitattributes` (`* text=auto eol=lf`). Prettier is `endOfLine: "lf"`; without this, only `windows-latest` fails `bun run lint` with Delete `␍`.
- Uses pinned `actions/checkout` and `oven-sh/setup-bun` SHAs; keep pins intentional when upgrading.
- The `check` checkout uses `fetch-depth: 0` so a PR can compare with `github.event.pull_request.base.sha` and a push can compare with `github.event.before`. For an initial push with GitHub's all-zero `before` SHA, it resolves `HEAD^` and reuses that resolved base for changed-source coverage.
- `check` runs `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run build`, and one `bun run test:coverage`.
- It lists added, copied, modified, and renamed `src/**/*.ts` files. When the list is nonempty, it runs related tests and a separate text coverage report with Vitest `--coverage.changed`; there are no coverage percentage thresholds.
- `validate-node` remains **macos-latest only** (iconutil / icns). Sets up Bun plus Node from `.nvmrc` (currently 26), runs `bun run validate:node`, then `git diff --exit-code` for icon drift including `build/icon.ico` and Windows tray PNGs.

## Beta Release (`develop`)

- A `main` push creates and pushes `v${package.json.version}` only when missing. It never installs, packages, verifies, or uploads release assets.
- On `v*` tags:
  - **`release-mac`** (`macos-latest`): requires Apple signing/notarization secrets; `bun run package:mac`; `verify:macos-release`; uploads DMG/ZIP + `SHA256SUMS-mac.txt` (+ `latest-mac.yml` when present).
  - **`release-win`** (`windows-latest`): optional `WIN_CSC_*` → export as `CSC_*` for Authenticode (unsigned dogfood if absent, K30); sequential `package:win:x64` then `package:win:arm64` with `--publish never`; `merge:windows-latest-yml` (K25); `REQUIRE_UPDATER_YML=1 verify:windows-release`; uploads four exes + `latest.yml` + `SHA256SUMS-win.txt`.
- Both jobs attach to the same GitHub Release (`make_latest: true`). Prefer separate checksum fragments to avoid race overwrites.
- Bake `GOOGLE_OAUTH_CLIENT_ID` into Windows builds via secrets when Connect Google must work in shipped installers.
- Triggers on every push to `develop` (including PR merges). Concurrency group `beta-release-develop` serializes runs so beta numbers do not collide.
- **Why release runs in the same workflow as tag creation:** GitHub does not start new workflow runs for pushes that use the default `GITHUB_TOKEN`. Creating `vX.Y.Z` on `main` therefore cannot rely on a follow-up “tag push” event to package. The `prepare` job ensures the version tag exists, and the `release` job packages/uploads in **that same run**.
- `prepare`: on `main`, tag is `v${package.json.version}` (must be plain `X.Y.Z`); create/push the annotated tag if missing; set `run_release=true`. On `v*` tag push without `-beta-`, set `run_release=true`. Beta tags set `run_release=false`.
  - **unsigned** — any secret missing (including no `CSC_LINK`) → `CSC_IDENTITY_AUTO_DISCOVERY=false`, package without Developer ID, **skip** verifier, warn in release notes about Gatekeeper.
- Do not use `-beta-` tags for official releases; beta tags are owned by `beta-release.yml`.

## Anti-Patterns

- Do not remove `fetch-depth: 0`; the PR check needs base comparisons and the release/beta jobs need tag visibility.
- Do not mark beta pre-releases as `make_latest: true` or omit `prerelease: true`.
- Do not commit the temporary beta `package.json` version bump from CI.
- Do not add custom Apple password variables or a warning-only artifact check on **official** release. Built-in Electron Builder notarization path and the verifier own official-release proof.
- Do not hand-edit generated icons to satisfy workflow drift; regenerate through `scripts/generate-calendar-tray-icons.mjs`.
- Do not duplicate build/package rules here; source of truth remains package scripts plus `electron-builder.yml`.
