# App Bootstrap

**Parent:** `src/main/AGENTS.md`

## OVERVIEW

App-level orchestration: composition root, subsystem init/shutdown, and IPC handler wiring. Imported by `src/main/index.ts`.

## FILES

| File | Exports | Role |
| --- | --- | --- |
| `lifecycle.ts` | `initializeApp`, `shutdownApp`, `getActiveAppGraph` | Subsystem orchestrator (`tryRun` / `tryRunCritical`). Creates `AppGraph` first; settings before scheduler; auto-updater last. |
| `ipc.ts` | `registerIpcHandlers(win, graph)` | Registers handlers from `ipc-handlers/` with the graph. |

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
- Display-horizon ticks (from `system/display-horizon.ts`) are wired here to free-function `republishUiForDisplayTick()` from `scheduler/facade.js` + `forceTrayMenuRefresh()` — display-only, never auto-open. (Not on `AppGraph.scheduler`.)
- Fatal init → `dialog.showErrorBox` + quit; non-fatal errors aggregated.
- `shutdownApp` prefers graph stop; falls back to free-function `stopScheduler` / `stopCalendarWatcher` if no graph (tests / early quit).
- Both files are for `index.ts` only (plus tests).
- `initAutoUpdater()` runs last among non-critical init steps; the module no-ops when `!app.isPackaged` or portable.
