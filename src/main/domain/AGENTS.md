# domain/

## OVERVIEW

Core domain modules: calendar access, change watching, last-poll status for the tray menu, and persistent settings (schema v2).

## FILES

| File                  | Exports                                                                                  | Purpose                                          |
| --------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `calendar.ts`         | `getCalendarEventsResult()`, `requestCalendarPermission()`, `getCalendarPermissionStatus()`, `invalidateCalendarPermissionCache()` | Swift EventKit queries → `CalendarResult` (err includes required `code`) |
| `calendar-watcher.ts` | `startCalendarWatcher()`, `stopCalendarWatcher()`, `reviveCalendarWatcher()` | Sidecar `swift --watch`; change → `forcePoll()`; revive after give-up/resume |
| `calendar-status.ts`  | `recordCalendarResult()`, `getLastCalendarStatus()` | Last poll ok/err for tray menu error rows |
| `settings.ts`         | `loadSettings()`, `saveSettings()`, `getSettings()`, `updateSettings()` | JSON-persisted settings in `userData/`; schema v2 migrate/rewrite |

## WHERE TO LOOK

| Task                       | Location                                  |
| -------------------------- | ----------------------------------------- |
| Add a setting field        | `src/shared/settings.ts` defaults + `domain/settings.ts` load/update + settings UI |
| Narrow CalendarResult      | `isCalendarOk()`; err `code`: `permission-denied` \| `no-calendars` \| `runtime` \| `unknown` |
| Hook a calendar-change event | `calendar-watcher.ts` → hardwired `void forcePoll()` |
| Menu status rows           | `calendar-status.ts` + `menu/meeting-menu.ts` |
| Swift binary internals     | `../swift/AGENTS.md`                      |
| Poll-trigger semantics     | `../scheduler/AGENTS.md`                  |

## NOTES

- `calendar.ts` imports from `../swift/binary-manager.js`, `event-parser.js`, `event-validator.js`. Production path maps `SwiftHelperError` → `CalendarResult` err with `code`.
- `calendar-watcher.ts` calls `forcePoll()` from `../scheduler/facade.js` on change. `reviveCalendarWatcher()` resets sidecar give-up state (used from lifecycle on resume).
- `poll.ts` must call `recordCalendarResult()` after every fetch so the tray menu can show permission/runtime rows.
- `settings.ts` is eager-loaded during lifecycle init **before** `startScheduler()`.
- Schema v2 fields: `autoOpenEnabled`, `alertLeadSeconds`, `nativeNotifications`, `lateJoinGraceMinutes`, quiet hours. `openBeforeMinutes` range is **0–10**. Load rewrites `settings.json` when migrating from v1.
- `loadSettings()` returns `Result<AppSettings, string>`; missing file uses `DEFAULT_SETTINGS`.
- Import these modules from `domain/`; do not add root-level calendar/settings shims for new callers.
- Permission cache is invalidated via `invalidateCalendarPermissionCache()` on power resume/unlock before scheduler restart.
