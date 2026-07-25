# IPC Handlers

**Parent:** `src/main/AGENTS.md`

## OVERVIEW

Type-safe IPC handler registry. Invoke handlers use `typedHandle()`; fire-and-forget handlers use `ipcMain.on()` with sender validation.

## FILES

| File           | Exports                                                             | Role                                                                                                                   |
| -------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `shared.ts`    | `typedHandle`, `typedSend`, sender validators, window-height bounds | Type-safe IPC wrapper + origin validation.                                                                             |
| `app.ts`       | `registerAppHandlers`                                               | `APP_OPEN_EXTERNAL` → `openMeetingUrl` (`Result`); `APP_JOIN_MEETING` → `joinMeetingById`; `APP_GET_VERSION`.        |
| `calendar.ts`  | `registerCalendarHandlers`                                          | `CALENDAR_GET_EVENTS` (err includes `code`), permission request/status.                                               |
| `settings.ts`  | `registerSettingsHandlers`                                          | `SETTINGS_GET` / `SETTINGS_SET`; selective `restartScheduler` for timing keys; always push `SETTINGS_CHANGED`.         |
| `window.ts`    | `registerWindowHandlers`                                            | `WINDOW_SET_HEIGHT` fire-and-forget.                                                                                   |
| `scheduler.ts` | `registerSchedulerHandlers`                                         | `SCHEDULER_FORCE_POLL` fire-and-forget → `void forcePoll()`.                                                           |
| `alert.ts`     | `registerAlertHandlers`                                             | `ALERT_DISMISSED` re-brands `EventId` then `cancelPendingBrowserOpen`.                                                 |

## PATTERNS

**Invoke handlers** — every invoke handler uses `validateSender()` and returns typed `IpcResponse`.

**Fire-and-forget** (`window.ts`, `scheduler.ts`, `alert.ts`) — `validateOnSender` + re-validate payload at main.

**Push channels** — `typedSend` with destroyed-window guards: `SETTINGS_CHANGED`, `CALENDAR_EVENTS_UPDATED`, `ALERT_SHOW`.

**Settings side effects** (`settings.ts`):
- Timing keys (`openBeforeMinutes`, `windowAlert`, `autoOpenEnabled`, `alertLeadSeconds`, `lateJoinGraceMinutes`, quiet hours, `nativeNotifications`) → `restartScheduler()`.
- `showTomorrowMeetings` alone → optional `forcePoll()` (no full restart).
- `launchAtLogin` → `syncAutoLaunch` only.
- Always `typedSend` `SETTINGS_CHANGED` after successful set.

## CHANNEL→HANDLER MAP

| Channel                       | Handler File | Type                                                                    |
| ----------------------------- | ------------ | ----------------------------------------------------------------------- |
| `APP_OPEN_EXTERNAL`           | app.ts       | invoke → `Result<void, string>` via `openMeetingUrl`                    |
| `APP_JOIN_MEETING`            | app.ts       | invoke `{ id: EventId }` → `Result` via `joinMeetingById`               |
| `APP_GET_VERSION`             | app.ts       | invoke                                                                  |
| `CALENDAR_GET_EVENTS`         | calendar.ts  | invoke → `CalendarResult`                                               |
| `CALENDAR_REQUEST_PERMISSION` | calendar.ts  | invoke                                                                  |
| `CALENDAR_PERMISSION_STATUS`  | calendar.ts  | invoke                                                                  |
| `SETTINGS_GET`                | settings.ts  | invoke                                                                  |
| `SETTINGS_SET`                | settings.ts  | invoke (+ selective restart / auto-launch)                              |
| `WINDOW_SET_HEIGHT`           | window.ts    | fire-and-forget                                                         |
| `SCHEDULER_FORCE_POLL`        | scheduler.ts | fire-and-forget                                                         |
| `ALERT_DISMISSED`             | alert.ts     | fire-and-forget                                                         |

## ANTI-PATTERNS

- Never bypass `validateSender()` / `validateOnSender()`
- Never open meeting URLs with raw `shell.openExternal` — use `openMeetingUrl` / `joinMeetingById`
- Never trust preload-branded payloads in fire-and-forget handlers; re-brand at main
- Never restart the scheduler for non-timing settings (e.g. `launchAtLogin` alone)
