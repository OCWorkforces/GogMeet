# App Bootstrap

**Parent:** `src/main/AGENTS.md`

## OVERVIEW

App-level orchestration: composition root, subsystem init/shutdown, and IPC handler wiring. Imported by `src/main/index.ts`.

## FILES

| File | Exports | Role |
| --- | --- | --- |
| `lifecycle.ts` | `initializeApp`, `shutdownApp`, `getActiveAppGraph`, `InitializeAppOptions` | Subsystem orchestrator (`tryRun` / `tryRunCritical`). Creates `AppGraph` first; settings before scheduler; auto-updater last. `probeSafe` skips power/shortcuts/notification/auto-launch/updater. |
| `ipc.ts` | `registerIpcHandlers(win, graph)` | Registers handlers from `ipc-handlers/` with the graph. |
| `performance-probe-contract.ts` | Finite `PERF_PROBE_MODES`, preflight, userData prefix validation | Private packaged measurement contracts only |
| `performance-probe.ts` | `preflightOrBlock`, `finalizeStartupProbe`, `runNamedProbeSurface` | Probe dispatcher after preflight |
| `performance-probes/*` | `tray-probe`, `alert-probe`, `safe-storage-probe` | Named surface drivers (synthetic data only) |

## WHERE TO LOOK

| Task | Location |
| --- | --- |
| Add subsystem to startup | `lifecycle.ts` → `initializeApp()` |
| Cleanup on quit | `lifecycle.ts` → `shutdownApp()` |
| Register IPC module | `ipc.ts` → `registerIpcHandlers(win, graph)` |
| Active graph (rare) | `getActiveAppGraph()` |

## NOTES

- **First critical step:** `createAppGraph()` then assign `activeGraph`.
- All subsequent calendar/settings/scheduler/watcher/tray/shortcuts use `graph.*` surfaces.
- Calendar permission: status always checked; `requestPermission` only when `shouldAutoRequestPermission()` (Darwin).
- Power resume/unlock: `invalidatePermissionCache()` → `watcher.revive()` → `scheduler.restart()`.
- Display-horizon ticks (from `system/display-horizon.ts`) are wired **before** `scheduler.start` to free-function `republishUiForDisplayTick()` from `scheduler/facade.js` + `forceTrayMenuRefresh()` — display-only, never auto-open. (Not on `AppGraph.scheduler`.)
- Init also: `setTrayTitleCallback`, `setSchedulerWindow`, `initPowerCallbacks` / `initPowerEvents`, `checkNotificationPermission`, `syncAutoLaunch`.
- Fatal init → `dialog.showErrorBox` + quit; non-fatal errors aggregated.
- `shutdownApp`: power cleanup → clear display horizon → force-destroy hide-cached alert/settings/about windows → graph stop (or free-function scheduler/watcher fallback if no graph) → unregister shortcuts → clear `activeGraph`.
- Both files are for `index.ts` only (plus tests).
- `initAutoUpdater()` runs last among non-critical init steps; no-ops when `!app.isPackaged` or portable. Otherwise configures install policy (`full` / feed-only) and schedules a ~5s quiet background check (log-only; no Restart dialog). Tray **Check for Updates…** calls `checkForUpdatesManual()` for user dialogs (up-to-date / Restart Now|Later / Open Releases).
- **Packaged probe mode** (`GOGMEET_PERF_PROBE=startup|tray|alert|safe-storage`): lab/CI only — **never** set for normal product installs. Requires `app.isPackaged`, `GOGMEET_PERF_TRACE=1`, and Electron `--user-data-dir` under `os.tmpdir()` with basename prefix `gogmeet-perf-probe-` (realpath leaf must keep the prefix). `index.ts` owns mode selection; lifecycle `probeSafe` gates external mutators for startup probes. Invalid preflight → exit 2 / factory throw (never EventKit/Google).
- Named surfaces (`tray`/`alert`/`safe-storage`) run under a surface budget (~75s) then flush fixed JSONL; startup probe flushes **once** after not-exercised phases (`finalizeStartupProbe`).
- When `GOGMEET_PERF_TRACE=1`, lifecycle/index emit finite `startup-phase` rows (`process-start` … `first-poll`); probe-safe startup records external phases as `not-exercised`.
