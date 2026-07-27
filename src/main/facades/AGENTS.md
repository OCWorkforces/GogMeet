# facades/

## OVERVIEW

Main-process **application surface** modules: calendar access facade (provider-backed), change watching, last-poll status for the tray menu, and persistent settings (schema v2).

These are **not** pure domain (see `src/domain/`). They may use Electron/`node:fs`/providers; prefer one-line use-case delegates and ports over growing facade logic.

## FILES

| File | Exports | Purpose |
| --- | --- | --- |
| `calendar.ts` | `getCalendarEventsResult`, `requestCalendarPermission`, `getCalendarPermissionStatus`, `invalidateCalendarPermissionCache`, `warmupCalendarProvider`, `shouldAutoRequestCalendarPermission`, `disconnectCalendar`, `getCalendarUiState`, `reportCalendarPollError` | Stable facade over `calendar/factory`; publishes `CalendarUiState` on the main bus |
| `calendar-watcher.ts` | `startCalendarWatcher()`, `stopCalendarWatcher()`, `reviveCalendarWatcher()` | Provider `startWatch` / `stopWatch` → `forcePoll()`; revive after give-up/resume |
| `calendar-status.ts` | `recordCalendarResult()`, `getLastCalendarStatus()` | Last poll ok/err for tray menu error rows |
| `settings.ts` | `loadSettings()`, `saveSettings()`, `getSettings()`, `updateSettings()` | JSON-persisted settings in `userData/`; schema v2 migrate/rewrite |

## WHERE TO LOOK

| Task | Location |
| --- | --- |
| Add a setting field | `settings.ts` + `domain/entities/settings.ts` |
| Narrow CalendarResult | `domain/entities/calendar-result.ts` → `isCalendarOk()` |
| Platform backends | `../calendar/` (factory + providers) |
| Swift internals | `../swift/AGENTS.md` (Darwin provider only) |
| Tray empty/error states | `getCalendarUiState` / `calendar-status-updated` |
| Menu status rows | `calendar-status.ts` + `menu/meeting-menu.ts` |

## NOTES

- **Must not** import `swift/*`. Delegate to `calendar/factory.ts` (watcher must not import `swift/*` long-term).
- Darwin EventKit: `calendar/providers/darwin-eventkit.ts`.
- Windows: `calendar/providers/google-calendar.ts` (OAuth + API).
- Watch is poll-only when provider omits `startWatch` (Google/fixture).
- `settings.ts` uses `domain/entities/type-guards` (`isObjectRecord`), never `swift/guards`.
- Permission cache in `calendar.ts`; invalidate on power resume before `restartScheduler()`.
- Lifecycle auto-request only when `shouldAutoRequestCalendarPermission()` (Darwin). Windows Connect is tray/Settings-only.
- Poll failures should call `reportCalendarPollError` so the tray is not stuck on “Loading…”.
- `calendar-watcher.ts` calls `forcePoll()` from `../scheduler/facade.js` on change.
- `poll.ts` must call `recordCalendarResult()` after every fetch so the tray menu can show permission/runtime rows.
- Schema v2 fields: `autoOpenEnabled`, `alertLeadSeconds`, `nativeNotifications`, `lateJoinGraceMinutes`, quiet hours. `openBeforeMinutes` range is **0–10**.

## NOTES (naming)

- Renamed from `src/main/domain/` to avoid collision with pure `src/domain/`.
- Call sites: scheduler, IPC, tray, shortcuts, lifecycle, join-meeting — import `facades/*` only, not providers.
