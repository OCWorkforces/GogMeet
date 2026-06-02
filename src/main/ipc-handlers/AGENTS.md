# IPC Handlers

**Parent:** `src/main/AGENTS.md`

## OVERVIEW

Type-safe IPC handler registry. Each domain file registers Electron `ipcMain.handle` / `ipcMain.on` listeners with sender validation.

## FILES

| File           | Exports                                                             | Role                                                                                                                   |
| -------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `shared.ts`    | `typedHandle`, `typedSend`, sender validators, window-height bounds | Type-safe IPC wrapper + origin validation.                                                                             |
| `app.ts`       | `registerAppHandlers`                                               | `APP_OPEN_EXTERNAL` (request `{url: MeetUrl}`, URL-validated), `APP_GET_VERSION`.                                      |
| `calendar.ts`  | `registerCalendarHandlers`                                          | `CALENDAR_GET_EVENTS`, `CALENDAR_REQUEST_PERMISSION`, `CALENDAR_PERMISSION_STATUS`.                                    |
| `settings.ts`  | `registerSettingsHandlers`                                          | `SETTINGS_GET` (invalid sender → fresh `{ ...DEFAULT_SETTINGS }`), `SETTINGS_SET` (invalid sender → fresh `{ ...DEFAULT_SETTINGS }`, no persistence); valid `SETTINGS_SET` restarts scheduler, syncs auto-launch, pushes settings changes. |
| `window.ts`    | `registerWindowHandlers`                                            | `WINDOW_SET_HEIGHT` fire-and-forget; request `{height: WindowHeight}` (branded bounded type; clamp remains defensive). |
| `scheduler.ts` | `registerSchedulerHandlers`                                         | `SCHEDULER_FORCE_POLL` fire-and-forget; `validateOnSender` → `void forcePoll()`.                                       |
| `alert.ts`     | `registerAlertHandlers`                                             | `ALERT_DISMISSED` fire-and-forget; `validateOnSender` + re-validates the unknown payload shape and re-brands `id` via `asEventId` before canceling the pending browser open. |

## PATTERNS

**Invoke handlers** (all except window.ts and scheduler.ts) — every invoke handler uses `validateSender()` (SETTINGS_GET previously missing, now fixed):

```
typedHandle(channel, (e, args) => { validateSender(e); ... })
```

→ Returns `IpcResponse<T>` to renderer via `ipcRenderer.invoke`.

**Fire-and-forget** (window.ts):

```
ipcMain.on(channel, (e, h) => { validateOnSender(e, ...); ... })
```

→ No return value. Uses `validateOnSender` (not `validateSender`).

**Push channels** (main → renderer via `typedSend`):

```
typedSend(win.webContents, channel, payload) — isDestroyed() guard, PushChannelMap types
```

**Registration**: Each file exports `register*Handlers(win?)`. Called from `src/main/ipc.ts`.

**Side effects** (settings.ts only): `SETTINGS_SET` calls `restartScheduler()`, `syncAutoLaunch()`, pushes `SETTINGS_CHANGED` to renderer via `typedSend(win.webContents, ...)`.

## CHANNEL→HANDLER MAP

| Channel                       | Handler File | Type                                                                    |
| ----------------------------- | ------------ | ----------------------------------------------------------------------- |
| `APP_OPEN_EXTERNAL`           | app.ts       | invoke (request `{url: MeetUrl}`, URL validated via `isAllowedMeetUrl`) |
| `APP_GET_VERSION`             | app.ts       | invoke                                                                  |
| `CALENDAR_GET_EVENTS`         | calendar.ts  | invoke                                                                  |
| `CALENDAR_REQUEST_PERMISSION` | calendar.ts  | invoke                                                                  |
| `CALENDAR_PERMISSION_STATUS`  | calendar.ts  | invoke                                                                  |
| `SETTINGS_GET`                | settings.ts  | invoke                                                                  |
| `SETTINGS_SET`                | settings.ts  | invoke (+ side effects)                                                 |
| `WINDOW_SET_HEIGHT`           | window.ts    | fire-and-forget (request `{height: WindowHeight}`, bounded 220–480)     |
| `SCHEDULER_FORCE_POLL`        | scheduler.ts | fire-and-forget → `void forcePoll()`                                    |
| `ALERT_DISMISSED`             | alert.ts     | fire-and-forget (request `{eventId: EventId}`)                          |

Push channels use `typedSend()` from `shared.ts`:

| Channel                   | Source          | Payload                                             |
| ------------------------- | --------------- | --------------------------------------------------- |
| `SETTINGS_CHANGED`        | settings.ts     | push via `typedSend` (`AppSettings`)                |
| `CALENDAR_EVENTS_UPDATED` | poll.ts         | push via `typedSend` (`MeetingEvent[]`, hash-gated) |
| `ALERT_SHOW`              | alert-window.ts | push via `typedSend` (`AlertPayload`)               |

## ANTI-PATTERNS

- Never bypass `validateSender()` / `validateOnSender()` — security boundary
- Never use `ipcMain.on` for data-returning handlers — use `typedHandle` + `ipcMain.handle`
- Never open URLs without `isAllowedMeetUrl` check
- Never push to renderer without checking `win.isDestroyed()`
- Never use raw `webContents.send()` — always use `typedSend()` from `shared.ts`
- All `typedHandle` callbacks now have explicit `(event: IpcMainInvokeEvent)` annotation
- Errors normalized through `AppError` taxonomy in `src/shared/errors.ts` (6 variants) — never throw raw strings from handlers
- Never trust preload-side branded payload typing in fire-and-forget handlers. The renderer/preload boundary can ship arbitrary shapes; re-validate the payload and re-brand (e.g. `asEventId`) at the main trust boundary before acting (see `ALERT_DISMISSED`).
