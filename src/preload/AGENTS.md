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
  calendar: {
    getEvents,
    requestPermission,
    getPermissionStatus,
    disconnect,
    getUiState,
    onEventsUpdated,
  },
  window: { setHeight },
  app: { openExternal, joinMeeting, getVersion },
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
| raw event id      | `asEventId()`                          | `APP_JOIN_MEETING: { id }`      |
| raw height number | `clampWindowHeight()` → `WindowHeight` | `WINDOW_SET_HEIGHT: { height }` |
| alert `EventId`   | passthrough from main push             | `ALERT_DISMISSED: { id }`       |

`brandMeetUrl` uses `asMeetUrl` + shared `isAllowedMeetHostname` from `src/shared/meet-url-allowlist.ts`.
Invalid URL → `openExternal` resolves `err("Invalid or disallowed URL")` without IPC.
Invalid id → `joinMeeting` resolves `err(...)` without IPC.

### Allowlist parity

Hostnames/suffixes live in **`src/shared/meet-url-allowlist.ts`** (imported by preload and main). Main remains authoritative egress via `openMeetingUrl` / `validateMeetUrl`. When changing hosts, update shared + Swift extraction + tests together.

## Push listener contract

Subscriptions return `() => void`:

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
- `../shared/calendar-ui-state.js` — `CalendarUiState` (via IPC response typing).

## Build constraints

- Electron stays external in `rslib.config.preload.ts`.
- Do not expose Node APIs or raw `ipcRenderer` to the renderer.
