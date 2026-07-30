# IPC Handlers

**Parent:** `src/main/AGENTS.md`

## OVERVIEW

Type-safe IPC handler registry. Invoke handlers use `typedHandle()`; fire-and-forget handlers use `ipcMain.on()` with sender validation. Domain handlers that need app services receive `AppGraph` from `app/ipc.ts`.

## FILES

| File | Exports | Role |
| --- | --- | --- |
| `shared.ts` | `typedHandle`, `typedSend`, sender validators, window-height bounds | Type-safe IPC wrapper + origin validation |
| `app.ts` | `registerAppHandlers(graph)` | `APP_OPEN_EXTERNAL` → `graph.opener.open`; `APP_JOIN_MEETING` → `graph.join.byId`; `APP_GET_VERSION` |
| `calendar.ts` | `registerCalendarHandlers(graph)` | get events / permission / disconnect / UI state; forcePoll on granted |
| `settings.ts` | `registerSettingsHandlers(win, graph)` | get/set settings; invalid sender → fresh defaults without persistence |
| `window.ts` | `registerWindowHandlers(win)` | `WINDOW_SET_HEIGHT` fire-and-forget |
| `alert.ts` | `registerAlertHandlers(graph)` | `ALERT_DISMISSED` re-brands `id` then `graph.scheduler.cancelPendingBrowserOpen` |

Calendar refresh is coordinated via `CALENDAR_GET_EVENTS` / `refreshCalendarPublication` (no separate force-poll IPC channel).

## PATTERNS

**Invoke handlers** — every invoke handler uses `validateSender()` and returns typed `IpcResponse`.

**Fire-and-forget** (`window.ts`, `alert.ts`) — `validateOnSender` + re-validate payload at main.

**Push channels** — `typedSend` with destroyed-window guards: `SETTINGS_CHANGED`, `CALENDAR_RESULT_UPDATED`, `ALERT_SHOW`.

**Settings side effects** (`settings.ts`):
- Timing keys (`openBeforeMinutes`, `windowAlert`, `autoOpenEnabled`, `alertLeadSeconds`, `lateJoinGraceMinutes`, quiet hours, `nativeNotifications`) → `graph.scheduler.restart()`.
- `showTomorrowMeetings` alone → optional `forcePoll()` (no full restart).
- `launchAtLogin` → `syncAutoLaunch` only.
- Always `typedSend` `SETTINGS_CHANGED` after successful set.

## CHANNEL→HANDLER MAP

| Channel | Handler File | Type |
| --- | --- | --- |
| `APP_OPEN_EXTERNAL` | app.ts | invoke → `Result` via `graph.opener` |
| `APP_JOIN_MEETING` | app.ts | invoke `{ id }` → `Result` via `graph.join.byId` |
| `APP_GET_VERSION` | app.ts | invoke |
| `CALENDAR_GET_EVENTS` | calendar.ts | invoke → `CalendarPublication` |
| `CALENDAR_REQUEST_PERMISSION` | calendar.ts | invoke (+ main `forcePoll` when granted) |
| `CALENDAR_PERMISSION_STATUS` | calendar.ts | invoke |
| `CALENDAR_DISCONNECT` | calendar.ts | invoke |
| `CALENDAR_UI_STATE` | calendar.ts | invoke → `CalendarUiState` |
| `SETTINGS_GET` | settings.ts | invoke |
| `SETTINGS_SET` | settings.ts | invoke (+ selective restart / auto-launch) |
| `WINDOW_SET_HEIGHT` | window.ts | fire-and-forget |
| `ALERT_DISMISSED` | alert.ts | fire-and-forget |

## ANTI-PATTERNS

- Never bypass `validateSender()` / `validateOnSender()` — security boundary
- Never use `ipcMain.on` for data-returning handlers — use `typedHandle` + `ipcMain.handle`
- Never open URLs without branded Meet URL / opener allowlist
- Never push to renderer without checking `win.isDestroyed()`
- Never use raw `webContents.send()` — always use `typedSend()` from `shared.ts`
- Errors use `AppError` from `src/domain/entities/errors.ts` — never throw raw strings from handlers
- Never trust preload-side branded payload typing in fire-and-forget handlers; re-validate and re-brand at main (e.g. `asEventId` on `ALERT_DISMISSED`)
- Never open meeting URLs with raw `shell.openExternal` — use `graph.opener` / `graph.join.byId`
