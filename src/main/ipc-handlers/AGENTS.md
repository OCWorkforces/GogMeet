# IPC Handlers

**Parent:** `src/main/AGENTS.md`

## OVERVIEW

Type-safe IPC handler registry. Each domain file registers Electron `ipcMain.handle` / `ipcMain.on` listeners with sender validation.

## FILES

| File          | Exports                                                                                                                               | Lines | Role                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| `shared.ts`   | `typedHandle`, `validateSender`, `validateOnSender`, `validateSenderUrl`, `ALLOWED_ORIGINS`, `MIN_WINDOW_HEIGHT`, `MAX_WINDOW_HEIGHT` | 53    | Infrastructure: type-safe wrapper + origin validation                              |
| `app.ts`      | `registerAppHandlers`                                                                                                                 | 36    | `APP_OPEN_EXTERNAL` (URL-validated), `APP_GET_VERSION`                             |
| `calendar.ts` | `registerCalendarHandlers`                                                                                                            | 56    | `CALENDAR_GET_EVENTS`, `CALENDAR_REQUEST_PERMISSION`, `CALENDAR_PERMISSION_STATUS` |
| `settings.ts` | `registerSettingsHandlers`                                                                                                            | 50    | `SETTINGS_GET`, `SETTINGS_SET` (triggers restartScheduler + syncAutoLaunch + push) |
| `window.ts`   | `registerWindowHandlers`                                                                                                              | 30    | `WINDOW_SET_HEIGHT` (fire-and-forget, clamped 220–480)                             |

## PATTERNS

**Invoke handlers** (all except window.ts):

```
typedHandle(channel, (e, args) => { validateSender(e); ... })
```

→ Returns `IpcResponse<T>` to renderer via `ipcRenderer.invoke`.

**Fire-and-forget** (window.ts):

```
ipcMain.on(channel, (e, h) => { validateOnSender(e, ...); ... })
```

→ No return value. Uses `validateOnSender` (not `validateSender`).

**Registration**: Each file exports `register*Handlers(win?)`. Called from `src/main/ipc.ts`.

**Side effects** (settings.ts only): `SETTINGS_SET` calls `restartScheduler()`, `syncAutoLaunch()`, pushes `SETTINGS_CHANGED` to renderer via `win.webContents.send()`.

## CHANNEL→HANDLER MAP

| Channel                       | Handler File | Type                                          |
| ----------------------------- | ------------ | --------------------------------------------- |
| `APP_OPEN_EXTERNAL`           | app.ts       | invoke (URL validated via `isAllowedMeetUrl`) |
| `APP_GET_VERSION`             | app.ts       | invoke                                        |
| `CALENDAR_GET_EVENTS`         | calendar.ts  | invoke                                        |
| `CALENDAR_REQUEST_PERMISSION` | calendar.ts  | invoke                                        |
| `CALENDAR_PERMISSION_STATUS`  | calendar.ts  | invoke                                        |
| `SETTINGS_GET`                | settings.ts  | invoke                                        |
| `SETTINGS_SET`                | settings.ts  | invoke (+ side effects)                       |
| `WINDOW_SET_HEIGHT`           | window.ts    | fire-and-forget (clamped)                     |

## ANTI-PATTERNS

- Never bypass `validateSender()` / `validateOnSender()` — security boundary
- Never use `ipcMain.on` for data-returning handlers — use `typedHandle` + `ipcMain.handle`
- Never open URLs without `isAllowedMeetUrl` check
- Never push to renderer without checking `win.isDestroyed()`
