# domain/

## OVERVIEW

Core domain modules: calendar access, change watching, and persistent settings.

## FILES

| File                  | Exports                                                                                  | Purpose                                          |
| --------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `calendar.ts`         | `getCalendarEventsResult()`, `requestCalendarPermission()`, `getCalendarPermissionStatus()`, `invalidateCalendarPermissionCache()` | Swift EventKit queries, returns `CalendarResult`; exposes cache invalidation hook |
| `calendar-watcher.ts` | `startCalendarWatcher(onChange)`, `stopCalendarWatcher()`                                | Sidecar `swift --watch` for EKEventStoreChangedNotification |
| `settings.ts`         | `AppSettings`, `DEFAULT_SETTINGS`, `loadSettings()`, `saveSettings()`, `getSettings()`   | JSON-persisted settings in `userData/`           |

## WHERE TO LOOK

| Task                       | Location                                  |
| -------------------------- | ----------------------------------------- |
| Add a setting field        | `settings.ts` → `AppSettings` + `DEFAULT_SETTINGS` |
| Narrow CalendarResult      | `calendar.ts` → `isCalendarOk()` guard    |
| Hook a calendar-change event | `calendar-watcher.ts` → `onChange` callback |
| Swift binary internals     | `../swift/AGENTS.md`                      |
| Poll-trigger semantics     | `../scheduler/AGENTS.md`                  |

## NOTES

- `calendar.ts` imports directly from `../swift/binary-manager.js`, `../swift/event-parser.js`, `../swift/event-validator.js`. No barrel re-exports.
- `calendar-watcher.ts` calls `forcePoll()` from `../scheduler/facade.js` on change events. macOS only; no-op elsewhere.
- `settings.ts` is eager-loaded during lifecycle init **before** `startScheduler()` so the scheduler reads a warm cache on first poll.
- `loadSettings()` returns `Result<AppSettings, AppError>`; missing file returns `DEFAULT_SETTINGS` via `isEnoent` predicate.
- `saveSettings()` writes formatted JSON to the app `userData` settings path and updates the in-memory cache after successful writes.
- All three files moved here from `src/main/` during the modularity refactor; update import paths accordingly when touching legacy callers.
- `calendar.ts` caches the EventKit permission status across calls. The cache is invalidated via `invalidateCalendarPermissionCache()`; lifecycle calls it on power resume/unlock before `restartScheduler()` so the next poll re-reads EventKit authorization.
