# App Bootstrap

**Parent:** `src/main/AGENTS.md`

## OVERVIEW

App-level orchestration: subsystem init/shutdown and IPC handler wiring. Imported by `src/main/index.ts`.

## FILES

| File           | Exports                          | Role                                                                              |
| -------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `lifecycle.ts` | `initializeApp`, `shutdownApp`   | Subsystem init/shutdown orchestrator. Uses `tryRun`/`tryRunAsync` (non-fatal) and `tryRunCritical`/`tryRunAsyncCritical` (fatal, throws). Eager-loads settings before scheduler start. |
| `ipc.ts`       | `registerIpcHandlers`            | Registers calendar, settings, app, window, scheduler IPC handlers from `ipc-handlers/`. |

## WHERE TO LOOK

| Task                          | Location                                                |
| ----------------------------- | ------------------------------------------------------- |
| Add new subsystem to startup  | `lifecycle.ts` → `initializeApp()`                      |
| Add cleanup on quit           | `lifecycle.ts` → `shutdownApp()`                        |
| Register new IPC handler file | `ipc.ts` → `registerIpcHandlers()`                      |
| Fatal vs non-fatal init       | `tryRunCritical` throws; `tryRun` collects to `errors[]` |

## NOTES

- `lifecycle.ts` imports subsystems from their post-refactor homes: `domain/` (calendar, settings, calendar-watcher), `system/` (power, auto-launch, notification, shortcuts), `windows/` (about-window), `scheduler/facade.js`, `swift/binary-manager.js`.
- `ipc.ts` is a thin registration shim. All handler logic lives in `../ipc-handlers/`.
- Fatal init failures surface via `dialog.showErrorBox()`; non-fatal errors are logged and aggregated.
- Settings must be loaded before `startScheduler()` so the scheduler reads warm cache on first poll.
- Both files are imported only by `index.ts`; no other consumers should reach in here.
