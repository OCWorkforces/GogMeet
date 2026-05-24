# Scripts

Repository automation scripts for local development and asset generation. These are invoked directly by `package.json` or manually, not bundled into app runtime.

## Files

| File                               | Role                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `dev.ts`                           | Bun dev orchestrator: rslib watch for main/preload, rsbuild dev server, Electron launch. |
| `generate-calendar-tray-icons.mjs` | Sharp/iconutil asset generator for tray PNGs, `build/icon.icns`, and About-dialog icon.  |

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

## Anti-Patterns

- Do not replace the TCP readiness check with fixed sleeps in `dev.ts`.
- Do not remove stale-output cleanup; old `lib/` files cause Electron to launch stale code.
- Do not hard-code a different dev-server port without updating BrowserWindow loading assumptions.
- Do not hand-edit generated tray/icon assets when the script can regenerate them.
