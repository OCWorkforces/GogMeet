# Preload Script — Context Bridge

Sandboxed Electron preload. It is the only bridge between renderer code and main IPC, and it brands raw renderer inputs before they cross process boundaries.

## Files

| File            | Role                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| `index.ts`      | `contextBridge.exposeInMainWorld("api", api)` and exported `Api` type. |
| `tsconfig.json` | Preload TypeScript project.                                            |

## Exposed API

```typescript
window.api = {
  calendar: { getEvents, requestPermission, getPermissionStatus, onEventsUpdated },
  window: { setHeight },
  app: { openExternal, getVersion },
  settings: { get, set, onChanged },
  alert: { onShowAlert, notifyDismissed },
  scheduler: { forcePoll },
};
```

`export type Api = typeof api` is consumed by renderer ambient typings.

## Trust-boundary branding

| Renderer input    | Validator                              | Main IPC payload                |
| ----------------- | -------------------------------------- | ------------------------------- |
| raw URL string    | `brandMeetUrl()` → `MeetUrl \| null`   | `APP_OPEN_EXTERNAL: { url }`    |
| raw height number | `clampWindowHeight()` → `WindowHeight` | `WINDOW_SET_HEIGHT: { height }` |
| alert `EventId`   | passthrough from main push             | `ALERT_DISMISSED: { id }`       |

`brandMeetUrl(raw)` first calls `asMeetUrl()` for structural validation, then checks the hostname against exact entries in `MEET_URL_ALLOWED_HOSTNAMES` (Google Meet/Calendar/Accounts, Calendly, and Zoom root hosts) plus suffix matches in `MEET_URL_ALLOWED_HOSTNAME_SUFFIXES` (currently `.zoom.us` for tenant subdomains). Invalid URLs return `null`; `openExternal()` resolves without invoking IPC.

`clampWindowHeight(n)` clamps and rounds into `[220, 480]`; non-finite input becomes the minimum.

### Allowlist parity invariant

The preload allowlist (`MEET_URL_ALLOWED_HOSTNAMES` + `MEET_URL_ALLOWED_HOSTNAME_SUFFIXES`) must mirror `MEETING_URL_ALLOWLIST` in `src/main/utils/url-validation.ts`. Because the sandboxed preload cannot import main, the mirror is intentional duplicate state, not a leak. When changing either list, update both in the same commit; main remains the authoritative egress gate (`APP_OPEN_EXTERNAL` re-validates), and the preload mirror only suppresses obvious bad URLs before IPC.

`alert.notifyDismissed(id)` round-trips the branded `EventId` received from `alert.onShowAlert`.

## Push listener contract

Every push subscription returns `() => void` and removes exactly the listener it added:

| Channel                   | Method                     | Payload          |
| ------------------------- | -------------------------- | ---------------- |
| `CALENDAR_EVENTS_UPDATED` | `calendar.onEventsUpdated` | `MeetingEvent[]` |
| `SETTINGS_CHANGED`        | `settings.onChanged`       | `AppSettings`    |
| `ALERT_SHOW`              | `alert.onShowAlert`        | `AlertPayload`   |

Main-side pushes use `typedSend()` with destroyed-window guards; never raw `webContents.send()`.

## Shared imports

There is no `models.ts` barrel. Import concrete files:

- `../shared/ipc-channels.js` — channels and `IpcRequest` / `IpcResponse` types.
- `../shared/meeting-event.js` — `MeetingEvent`.
- `../shared/settings.js` — `AppSettings`.
- `../shared/alert.js` — `AlertPayload`.
- `../shared/brand.js` — `asMeetUrl`, `clampWindowHeight`, branded types.

## Build constraints

- Electron must remain external in `rslib.config.preload.ts`; bundling Electron breaks `contextBridge` in the sandbox.
- Preload must not expose Node APIs, `ipcRenderer`, or arbitrary channel senders to renderer.
- Keep BrowserWindow assumptions aligned with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.
