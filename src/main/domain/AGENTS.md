# domain/

## OVERVIEW

Core domain modules: calendar access facade (provider-backed), change watching, and persistent settings.

## FILES

| File | Exports | Purpose |
| --- | --- | --- |
| `calendar.ts` | `getCalendarEventsResult`, `requestCalendarPermission`, `getCalendarPermissionStatus`, `invalidateCalendarPermissionCache`, `warmupCalendarProvider`, `shouldAutoRequestCalendarPermission`, `disconnectCalendar`, `getCalendarUiState`, `reportCalendarPollError` | Stable facade over `calendar/factory`; publishes `CalendarUiState` on the main bus |
| `calendar-watcher.ts` | `startCalendarWatcher`, `stopCalendarWatcher` | Provider `startWatch` / `stopWatch` → `forcePoll()` |
| `settings.ts` | `loadSettings`, `saveSettings`, `getSettings`, `updateSettings` | JSON settings in `userData/` |

## WHERE TO LOOK

| Task | Location |
| --- | --- |
| Add a setting field | `settings.ts` + `shared/settings.ts` |
| Narrow CalendarResult | `shared/calendar-result.ts` → `isCalendarOk()` |
| Platform backends | `../calendar/` (factory + providers) |
| Swift internals | `../swift/AGENTS.md` (Darwin provider only) |
| Tray empty/error states | `getCalendarUiState` / `calendar-status-updated` |

## NOTES

- **Must not** import `swift/*`. Delegate to `calendar/factory.ts`.
- Darwin EventKit: `calendar/providers/darwin-eventkit.ts`.
- Windows: `calendar/providers/google-calendar.ts` (OAuth + API).
- Watch is poll-only when provider omits `startWatch` (Google/fixture).
- `settings.ts` uses `shared/type-guards` (`isObjectRecord`), never `swift/guards`.
- Permission cache in `calendar.ts`; invalidate on power resume before `restartScheduler()`.
- Lifecycle auto-request only when `shouldAutoRequestCalendarPermission()` (Darwin). Windows Connect is tray/Settings-only.
- Poll failures should call `reportCalendarPollError` so the tray is not stuck on “Loading…”.
