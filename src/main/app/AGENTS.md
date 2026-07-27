# App Bootstrap

**Parent:** `src/main/AGENTS.md`

## OVERVIEW

App-level orchestration: subsystem init/shutdown and IPC handler wiring. Imported by `src/main/index.ts`.

## FILES

| File | Exports | Role |
| --- | --- | --- |
| `lifecycle.ts` | `initializeApp`, `shutdownApp` | Subsystem orchestrator (`tryRun` / `tryRunCritical`). Settings before scheduler; auto-updater last. |
| `ipc.ts` | `registerIpcHandlers` | Registers handlers from `ipc-handlers/`. |

## WHERE TO LOOK

| Task | Location |
| --- | --- |
| Add subsystem to startup | `lifecycle.ts` → `initializeApp()` |
| Cleanup on quit | `lifecycle.ts` → `shutdownApp()` |
| Register IPC module | `ipc.ts` → `registerIpcHandlers()` |

## NOTES

- Imports: `facades/` (calendar, settings, watcher), `system/` (power, auto-launch, notification, shortcuts, **auto-updater**), `scheduler/facade.js`, tray — **not** `swift/binary-manager` (warmup via `warmupCalendarProvider`).
- Calendar permission: status always checked; `requestCalendarPermission` only when `shouldAutoRequestCalendarPermission()` (Darwin).
- Power resume/unlock: `invalidateCalendarPermissionCache()` then `restartScheduler()`.
- Fatal init → `dialog.showErrorBox` + quit; non-fatal errors aggregated.
- Both files are for `index.ts` only.
- Resume/unlock callback order: `invalidateCalendarPermissionCache()` → `reviveCalendarWatcher()` → `restartScheduler()` so authorization and the watch sidecar recover after sleep/lock.
- `initAutoUpdater()` runs last among non-critical init steps; the module no-ops when `!app.isPackaged`.
