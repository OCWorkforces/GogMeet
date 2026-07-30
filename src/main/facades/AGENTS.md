# facades/

## OVERVIEW

Main-process **application surface** modules: calendar access facade (provider-backed), change watching, last-poll status for the tray menu, and persistent settings (schema v2).

These are **not** pure domain (see `src/domain/`). They may use Electron/`node:fs`/providers; prefer one-line use-case delegates and ports over growing facade logic. Production code often reaches them through `AppGraph`; free functions remain for scheduler internals and default binds.

## FILES

| File | Exports | Purpose |
| --- | --- | --- |
| `calendar.ts` | `getCalendarEventsResult(signal?)`, permission/disconnect/warmup/UI state, bind helpers | Stable facade over `calendar/factory`; publishes `CalendarUiState` on the main bus |
| `calendar-watcher.ts` | `startCalendarWatcher`, `stopCalendarWatcher`, `reviveCalendarWatcher` | Provider `startWatch` / `stopWatch` → `forcePoll()`; revive after give-up/resume |
| `calendar-status.ts` | `recordCalendarResult`, `getLastCalendarStatus` | Last poll ok/err for tray menu error rows (`isCalendarOk`) |
| `settings.ts` | `loadSettings`, `saveSettings`, `getSettings`, `updateSettings`, bind helpers | JSON-persisted settings via JsonSettingsStore; schema v2 |

## WHERE TO LOOK

| Task | Location |
| --- | --- |
| Add a setting field | `settings.ts` + `domain/entities/settings.ts` + `domain/services/settings-parse.ts` |
| CalendarResult provenance | `domain/entities/calendar-result.ts` → `isCalendarOk` / automation helpers |
| UI phases (`limited`, offline age) | `domain/entities/calendar-ui-state.ts` + `application/use-cases/get-meetings.ts` |
| Platform backends | `../calendar/` (factory + providers + google-http) |
| Swift internals | `../swift/AGENTS.md` (Darwin provider only) |
| Tray empty/error/limited states | `getCalendarUiState` / `calendar-status-updated` / `menu/meeting-menu.ts` |
| Graph wiring | `../composition/app-graph.ts` |

## NOTES

- **Must not** import `swift/*` or `calendar/auth/*`. Use CalendarPort methods (`getAccountLabel`, `reviveWatch`, …).
- Darwin EventKit: `calendar/providers/darwin-eventkit.ts`.
- Windows: `calendar/providers/google-calendar.ts` (OAuth + API + google-http).
- Watch is poll-only when provider omits `startWatch` (Google/fixture).
- `settings.ts` uses `domain/entities/type-guards` (`isObjectRecord`), never `swift/guards`.
- Permission cache in `calendar.ts`; invalidate on power resume before `restartScheduler()`.
- Lifecycle auto-request only when `shouldAutoRequestCalendarPermission()` (Darwin). Windows Connect is tray/Settings-only.
- Poll failures should call `reportCalendarPollError` so the tray is not stuck on “Loading…”.
- `calendar-watcher.ts` calls `forcePoll()` from `../scheduler/facade.js` on change.
- `poll.ts` must call `recordCalendarResult()` after every fetch so the tray menu can show permission/runtime rows.
- Schema v2 fields: `autoOpenEnabled`, `alertLeadSeconds`, `nativeNotifications`, `lateJoinGraceMinutes`, quiet hours. `openBeforeMinutes` range is **0–10**.
