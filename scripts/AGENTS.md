# Scripts

Repository automation scripts for local development and asset generation. These are invoked directly by `package.json` or manually, not bundled into app runtime.

## Files

| File                               | Role                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `dev.ts`                           | Bun dev orchestrator: rslib watch for main/preload, rsbuild dev server, Electron launch. |
| `generate-calendar-tray-icons.mjs` | Sharp/iconutil asset generator for tray PNGs, `build/icon.icns`, and About-dialog icon.  |
| `validate-node.mjs`                | Host-Node 26 guard: parses `process.versions.node`, then runs the icon generator under host Node. Wired to `bun run validate:node` and the PR-check `validate-node` job. |

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
- Outputs tray icons to `src/assets/`: dark/light 1x and 2x PNGs.
- Outputs app icon to `build/icon.icns` through a temporary `build/AppIcon.iconset` and `iconutil`.
- Uses `sharp`; keep `sharp` in devDependencies when editing this script.
- The script also emits the About-dialog aura asset used by main windows.

## `validate-node.mjs` Contract

- Bun-first project: dev, build, test, lint, and packaging run under Bun (`packageManager: bun@1.3.14`). A small set of contributor paths still shell out to plain Node — the icon generator above and the release tag step (`node -p "require('./package.json').version"`). Those must run on the host Node pinned in `.nvmrc` (currently `26`).
- Plain Node ESM, no TypeScript, no dependencies beyond Node built-ins (`node:child_process`, `node:path`, `node:url`).
- Reads `process.versions.node`, exits non-zero with a clear error message when the host Node major is less than `REQUIRED_MAJOR` (26), and prints the host Node version on success.
- Spawns `node scripts/generate-calendar-tray-icons.mjs` under the same host Node and forwards its exit status. The `NODE_VALIDATE_SKIP_GENERATE=1` env var skips the spawn for unit tests; do not use it in CI.
- Pure helpers (`parseMajor`, `validateNodeVersion`, `runValidation`) are exported and injected so `tests/scripts/validate-node.test.ts` can drive every branch without needing host Node 26 or running the real generator.
- Electron 42 still embeds Node 24.15.0 at runtime for the packaged app. The host Node 26 enforced here is only for contributor tooling — do not change `engines.node` or the embedded Electron Node to match.

## Anti-Patterns

- Do not replace the TCP readiness check with fixed sleeps in `dev.ts`.
- Do not remove stale-output cleanup; old `lib/` files cause Electron to launch stale code.
- Do not hard-code a different dev-server port without updating BrowserWindow loading assumptions.
- Do not hand-edit generated tray/icon assets when the script can regenerate them.
- Do not swap `scripts/dev.ts` away from Bun or rewrite the Bun-first scripts in `package.json` to npm/yarn/pnpm.
- Do not add runtime shims or fallbacks to `validate-node.mjs` beyond the explicit `NODE_VALIDATE_SKIP_GENERATE` test hook.
