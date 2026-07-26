# domain/

## OVERVIEW

Core domain modules: calendar access facade, change watching, and persistent settings.

## FILES

| File                  | Exports                                                                                  | Purpose                                          |
| --------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `calendar.ts`         | `getCalendarEventsResult()`, `requestCalendarPermission()`, `getCalendarPermissionStatus()`, `invalidateCalendarPermissionCache()`, `warmupCalendarProvider()`, `shouldAutoRequestCalendarPermission()`, `disconnectCalendar()` | Stable facade over `calendar/factory` providers |
| `calendar-watcher.ts` | `startCalendarWatcher()`, `stopCalendarWatcher()`                                       | Provider `startWatch`/`stopWatch` → `forcePoll()` |
| `settings.ts`         | `AppSettings`, `DEFAULT_SETTINGS`, `loadSettings()`, `saveSettings()`, `getSettings()`   | JSON-persisted settings in `userData/`           |

## WHERE TO LOOK

| Task                       | Location                                  |
| -------------------------- | ----------------------------------------- |
| Add a setting field        | `settings.ts` → `AppSettings` + `DEFAULT_SETTINGS` |
| Narrow CalendarResult      | `../../shared/calendar-result.ts` → `isCalendarOk()` |
| Platform calendar backends | `../calendar/` (factory + providers)      |
| Swift binary internals     | `../swift/AGENTS.md` (Darwin provider only) |
| Poll-trigger semantics     | `../scheduler/AGENTS.md`                  |

## NOTES

- `calendar.ts` must **not** import `swift/*`. It delegates to `calendar/factory.ts`.
- Darwin EventKit lives in `calendar/providers/darwin-eventkit.ts` (static `swift/*` imports OK there only).
- Non-Darwin uses `stub-unsupported` until Wave 4 Google provider.
- `calendar-watcher.ts` is poll-only when the provider omits `startWatch`.
- `settings.ts` imports `isObjectRecord` from `shared/type-guards` — never from `swift/guards`.
- `loadSettings()` returns `Result<AppSettings, string>`; missing file returns `DEFAULT_SETTINGS` via `isEnoent` predicate.
- Permission status is cached in `calendar.ts`; `invalidateCalendarPermissionCache()` is called on power resume before `restartScheduler()`.
- Lifecycle auto-requests permission only when `shouldAutoRequestCalendarPermission()` is true (Darwin).
