# Scripts

Repository automation scripts for local development and asset generation. These are invoked directly by `package.json` or manually, not bundled into app runtime.

## Files

| File                               | Role                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `dev.ts`                           | Bun dev orchestrator: rslib watch for main/preload, rsbuild dev server, Electron launch. |
| `generate-calendar-tray-icons.mjs` | Sharp asset generator: tray PNGs (mac 18/36 + win 16/32), `build/icon.icns` (mac/iconutil), `build/icon.ico` (any OS), About SVG. |
| `validate-node.mjs`                | Host-Node 26 guard: parses `process.versions.node`, then runs the icon generator under host Node. Wired to `bun run validate:node` and the PR-check `validate-node` job. |
| `verify-macos-release.mjs`         | Official macOS release verifier: inventories deterministic containers and inspects their extracted apps. Wired to `bun run verify:macos-release`. |
| `verify-windows-release.mjs`       | Windows release inventory verifier (NSIS + portable x64/arm64; optional latest.yml both arches). Wired to `bun run verify:windows-release`. |
| `merge-windows-latest-yml.mjs`     | Rebuilds `dist/latest.yml` listing both NSIS arches after sequential arch builds (K25). Wired to `bun run merge:windows-latest-yml`. |

## `dev.ts` Contract

- Shebang is `#!/usr/bin/env bun`; run via `bun run dev`.
- Cleans `lib/main` and `lib/preload` before starting watches so stale artifacts cannot satisfy readiness checks.
- Starts two rslib watches: `rslib.config.ts` and `rslib.config.preload.ts`.
- Starts Rsbuild dev server on port `5173`.
- Waits for both `lib/main/index.cjs` and `lib/preload/index.cjs`, then TCP-checks `localhost:5173` before launching Electron.
- Launches Electron with `--disable-gpu-sandbox`, `ELECTRON_ENABLE_LOGGING=1`, and `VITE_DEV_SERVER_URL=http://localhost:5173`.
- SIGINT/SIGTERM and Electron exit kill all child processes.

## Icon Generation Contract

- Run with `bun scripts/generate-calendar-tray-icons.mjs` or Node.
- Outputs tray icons to `src/assets/`: mac dark/light 18/36, Windows dark/light 16/32.
- Outputs `build/icon.icns` via `iconutil` on macOS only (skipped elsewhere).
- Outputs `build/icon.ico` multi-size PNG-in-ICO via sharp on any OS (Windows packaging).
- Uses `sharp`; keep `sharp` in devDependencies when editing this script.
- The script also emits the About-dialog aura asset used by main windows.

## `validate-node.mjs` Contract

- Bun-first project: dev, build, test, lint, and packaging run under Bun (`packageManager: bun@1.3.14`). A small set of contributor paths still shell out to plain Node — the icon generator above and the release tag step (`node -p "require('./package.json').version"`). Those must run on the host Node pinned in `.nvmrc` (currently `26`).
- Plain Node ESM, no TypeScript, no dependencies beyond Node built-ins (`node:child_process`, `node:path`, `node:url`).
- Reads `process.versions.node`, exits non-zero with a clear error message when the host Node major is less than `REQUIRED_MAJOR` (26), and prints the host Node version on success.
- Spawns `node scripts/generate-calendar-tray-icons.mjs` under the same host Node and forwards its exit status. The `NODE_VALIDATE_SKIP_GENERATE=1` env var skips the spawn for unit tests; do not use it in CI.
- Pure helpers (`parseMajor`, `validateNodeVersion`, `runValidation`) are exported and injected so `tests/scripts/validate-node.test.ts` can drive every branch without needing host Node 26 or running the real generator.
- Electron embeds its own Node runtime for the packaged app. The host Node 26 enforced here is only for contributor tooling — do not change `engines.node` or conflate it with Electron's embedded runtime.

## `verify-macos-release.mjs` Contract

- Plain Node ESM with no dependencies. It runs only on macOS and fails closed for missing, extra, or wrong-version DMG/ZIP containers.
- Every DMG is attached read-only and every ZIP is extracted with `ditto`; each must contain exactly one app. The verifier checks Developer ID signing, hardened runtime, bundle ID, architecture, Gatekeeper assessment, app stapling, entitlements, and unpacked Swift source.
- It runs the Swift cache smoke only from the extracted ZIP matching the runner's native architecture. The smoke uses an isolated `TMPDIR`, validates cache mode `0700` and the source hash, accepts helper exits `0`, `2`, or `3`, and removes only its own app process group and temporary directory.
- `xcrun stapler validate` is run against the contained app only. Do not claim that an unsigned DMG or ZIP container is stapled or notarized.
- Native command execution is injectable through `macos-release-verifier-native.mjs`; keep pure parsing and validation helpers exported through `verify-macos-release.mjs` for `tests/scripts/verify-macos-release.test.ts`.

## Anti-Patterns

- Do not replace the TCP readiness check with fixed sleeps in `dev.ts`.
- Do not remove stale-output cleanup; old `lib/` files cause Electron to launch stale code.
- Do not hard-code a different dev-server port without updating BrowserWindow loading assumptions.
- Do not hand-edit generated tray/icon assets when the script can regenerate them.
- Do not swap `scripts/dev.ts` away from Bun or rewrite the Bun-first scripts in `package.json` to npm/yarn/pnpm.
- Do not add runtime shims or fallbacks to `validate-node.mjs` beyond the explicit `NODE_VALIDATE_SKIP_GENERATE` test hook.
- Do not make this verifier permissive for unsigned local builds. Local `bun run package` is permissive, while the official tag workflow requires credentials and runs this verifier.
