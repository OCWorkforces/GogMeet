# Preload Script — Context Bridge

Sandboxed Electron preload. It is the only bridge between renderer code and main IPC, and it brands raw renderer inputs before they cross process boundaries.

## Files

| File | Role |
| --- | --- |
| `index.ts` | `contextBridge.exposeInMainWorld("api", api)` and exported `Api` type |
| `tsconfig.json` | Preload TypeScript project |

## Exposed API

```typescript
window.api = {
  calendar: {
    getEvents, // returns CalendarPublication
    requestPermission,
    getPermissionStatus,
    disconnect,
    getUiState,
    onResultUpdated, // CalendarPublication push
  },
  window: { setHeight },
  app: { openExternal, joinMeeting, getVersion },
  settings: { get, set, onChanged },
  alert: { onShowAlert, notifyDismissed },
};
```

Refresh is coordinated in main via the single-flight refresh coordinator: `calendar.getEvents()` is the sole renderer refresh path (no `scheduler.forcePoll` IPC — permanent guardrail). Responses and pushes use `CalendarPublication` (`publicationGeneration` + `result`).

`export type Api = typeof api` is consumed by renderer ambient typings (`src/renderer/env.d.ts` and settings `env.d.ts`).

Settings payloads include schema **v3** fields (e.g. `showCompletedTodayMeetings`); preload does not interpret display preferences.

## Trust-boundary branding

| Renderer input | Validator | Main IPC payload |
| --- | --- | --- |
| raw URL string | `brandMeetUrl()` → `MeetUrl \| null` | `APP_OPEN_EXTERNAL: { url }` |
| raw event id | `asEventId()` | `APP_JOIN_MEETING: { id }` |
| raw height number | `clampWindowHeight()` → `WindowHeight` | `WINDOW_SET_HEIGHT: { height }` |
| alert `EventId` | passthrough from main push | `ALERT_DISMISSED: { id }` |

`brandMeetUrl` uses `asMeetUrl` + `isAllowedMeetHostname` from `src/domain/policies/meet-url-allowlist.ts`.
Invalid URL → `openExternal` resolves `err("Invalid or disallowed URL")` without IPC.
Invalid id → `joinMeeting` resolves `err(...)` without IPC.

### Allowlist parity

Hostnames/suffixes live in **`src/domain/policies/meet-url-allowlist.ts`** (imported by preload and domain validation). Main remains authoritative egress via ShellMeetingOpener / `validateMeetUrl`. When changing hosts, update domain allowlist + Swift extraction + tests together.

## Push listener contract

Subscriptions return `() => void`:

| Channel | Method | Payload |
| --- | --- | --- |
| `CALENDAR_RESULT_UPDATED` | `calendar.onResultUpdated` | `CalendarPublication` |
| `SETTINGS_CHANGED` | `settings.onChanged` | `AppSettings` |
| `ALERT_SHOW` | `alert.onShowAlert` | `AlertPayload` |

Main-side pushes use `typedSend()` with destroyed-window guards; never raw `webContents.send()`.

## Transport notes

- **Invoke** (`ipcRenderer.invoke`): calendar + app + settings get/set.
- **Send** (`ipcRenderer.send`, fire-and-forget): `WINDOW_SET_HEIGHT`, `ALERT_DISMISSED`.
- **On** (push listeners with unsubscribe): `CALENDAR_RESULT_UPDATED`, `SETTINGS_CHANGED`, `ALERT_SHOW`.

## Imports

There is no models barrel. Import concrete files:

- `../shared/ipc-channels.js` — channels and `IpcRequest` / `IpcResponse` types
- `../shared/alert.js` — `AlertPayload`
- `../domain/entities/settings.js` — `AppSettings`
- `../domain/entities/calendar-publication.js` — `CalendarPublication` (push typing)
- `../domain/entities/brand.js` — `asMeetUrl`, `asEventId`, `clampWindowHeight`
- `../domain/entities/result.js` — `Result`, `err`
- `../domain/policies/meet-url-allowlist.js` — `isAllowedMeetHostname`

## Build constraints

- Electron stays external in `rslib.config.preload.ts`.
- Do not expose Node APIs or raw `ipcRenderer` to the renderer.
