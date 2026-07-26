# IPC Handlers

**Parent:** `src/main/AGENTS.md`

## OVERVIEW

Type-safe IPC handler registry. Invoke handlers use `typedHandle()`; fire-and-forget handlers use `ipcMain.on()` with sender validation.

## FILES

| File           | Exports                                                             | Role                                                                                                                   |
| -------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `shared.ts`    | `typedHandle`, `typedSend`, sender validators, window-height bounds | Type-safe IPC wrapper + origin validation.                                                                             |
| `app.ts`       | `registerAppHandlers`                                               | `APP_OPEN_EXTERNAL` (request `{url: MeetUrl}`, URL-validated), `APP_GET_VERSION`.                                      |
| `calendar.ts`  | `registerCalendarHandlers`                                          | `CALENDAR_GET_EVENTS`, `CALENDAR_REQUEST_PERMISSION` (forcePoll on granted), `CALENDAR_PERMISSION_STATUS`, `CALENDAR_DISCONNECT`, `CALENDAR_UI_STATE`. |
| `settings.ts`  | `registerSettingsHandlers`                                          | `SETTINGS_GET` (invalid sender → fresh `{ ...DEFAULT_SETTINGS }`), `SETTINGS_SET` (invalid sender → fresh `{ ...DEFAULT_SETTINGS }`, no persistence); valid `SETTINGS_SET` restarts scheduler, syncs auto-launch, pushes settings changes. |
| `window.ts`    | `registerWindowHandlers`                                            | `WINDOW_SET_HEIGHT` fire-and-forget; request `{height: WindowHeight}` (branded bounded type; clamp remains defensive). |
| `scheduler.ts` | `registerSchedulerHandlers`                                         | `SCHEDULER_FORCE_POLL` fire-and-forget; `validateOnSender` → `void forcePoll()`.                                       |
| `alert.ts`     | `registerAlertHandlers`                                             | `ALERT_DISMISSED` fire-and-forget; `validateOnSender` + re-validates the unknown payload shape and re-brands `id` via `asEventId` before canceling the pending browser open. |
| `app.ts`       | `registerAppHandlers`                                               | `APP_OPEN_EXTERNAL` → `openMeetingUrl` (`Result`); `APP_JOIN_MEETING` → `joinMeetingById`; `APP_GET_VERSION`.        |

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
| `CALENDAR_GET_EVENTS`         | calendar.ts  | invoke                                                                  |
| `CALENDAR_REQUEST_PERMISSION` | calendar.ts  | invoke (+ forcePoll when granted)                                       |
| `CALENDAR_PERMISSION_STATUS`  | calendar.ts  | invoke                                                                  |
| `CALENDAR_DISCONNECT`         | calendar.ts  | invoke                                                                  |
| `CALENDAR_UI_STATE`           | calendar.ts  | invoke → `CalendarUiState`                                              |
| `SETTINGS_GET`                | settings.ts  | invoke                                                                  |
| `SETTINGS_SET`                | settings.ts  | invoke (+ selective restart / auto-launch)                              |
| `WINDOW_SET_HEIGHT`           | window.ts    | fire-and-forget                                                         |
| `SCHEDULER_FORCE_POLL`        | scheduler.ts | fire-and-forget                                                         |
| `ALERT_DISMISSED`             | alert.ts     | fire-and-forget                                                         |

## ANTI-PATTERNS

- Never bypass `validateSender()` / `validateOnSender()` — security boundary
- Never use `ipcMain.on` for data-returning handlers — use `typedHandle` + `ipcMain.handle`
- Never open URLs without `isAllowedMeetUrl` check
- Never push to renderer without checking `win.isDestroyed()`
- Never use raw `webContents.send()` — always use `typedSend()` from `shared.ts`
- Errors use `AppError` in `src/shared/errors.ts` (`calendar-*`, `validation`, `io`, `unknown`) — never throw raw strings from handlers
- Never trust preload-side branded payload typing in fire-and-forget handlers. The renderer/preload boundary can ship arbitrary shapes; re-validate the payload and re-brand (e.g. `asEventId`) at the main trust boundary before acting (see `ALERT_DISMISSED`).
- Never open meeting URLs with raw `shell.openExternal` — use `openMeetingUrl` / `joinMeetingById`
