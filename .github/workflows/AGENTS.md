# GitHub Workflows

CI/release automation for the macOS Electron app. Keep workflow behavior aligned with `package.json`, `.nvmrc`, `scripts/validate-node.mjs`, and packaging guidance in `build/AGENTS.md`.

## Files

| File | Role |
| --- | --- |
| `pr-check.yml` | PR/push validation on `develop` and `main`: typecheck, tests, coverage, Node 26 validation. |
| `release.yml` | Release packaging on `main` pushes and `v*` tags; creates version tag when needed and uploads DMG/ZIP assets. |

## PR Check

- Runs on `macos-latest`; do not move to Linux unless Swift/EventKit/icon tooling assumptions are replaced.
- Uses pinned `actions/checkout` and `oven-sh/setup-bun` SHAs; keep pins intentional when upgrading.
- `check` job runs `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test`, then `bun run test:coverage`.
- `validate-node` job sets up Bun plus Node from `.nvmrc` (currently 26), then runs `bun run validate:node`.
- `validate:node` regenerates icons through the host Node path, but this workflow does not currently assert a clean git diff afterward.
- PR workflow does not run `bun run lint` or `bun run format:check` today; do not claim those gates exist without adding steps.

## Release

- Triggered by pushes to `main` and tags matching `v*`; permissions require `contents: write` for tag creation and release upload.
- Bun is pinned to `1.3.14`; Node 26 comes from `.nvmrc` for the `node -p "require('./package.json').version"` tag step.
- On `main`, create `v${package.json.version}` only when that tag is missing; if the tag already exists, packaging is skipped.
- On tag pushes, package directly using the tag ref.
- The workflow runs `bun run build` before `bun run package`; `bun run package` invokes `bun run build` again.
- `Upload release assets` is the real artifact gate: `fail_on_unmatched_files: true` for `dist/*.dmg,dist/*.zip`.

## Anti-Patterns

- Do not remove `fetch-depth: 0`; the release job needs tag visibility.
- Do not assume notarization ran just because Apple secrets are present; packaging hooks still follow `electron-builder.yml` / `build/notarize.cjs` rules.
- Do not hand-edit generated icons to satisfy workflow drift; regenerate through `scripts/generate-calendar-tray-icons.mjs`.
- Do not duplicate build/package rules here; source of truth remains package scripts plus `electron-builder.yml`.
