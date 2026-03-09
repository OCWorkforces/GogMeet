# Main Process — Electron Main

Electron main process (Node.js). Handles app lifecycle, system tray, IPC, then macOS Calendar via Swift EventKit.

## FILES

| File                      | Role                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- |
| `index.ts`                | App bootstrap, BrowserWindow factory, lifecycle events                       |
| `calendar.ts`             | Swift EventKit calendar queries (compiles/caches `googlemeet-events` binary) |
| `scheduler.ts`            | Auto-opens browser 1 min before meetings; 2-min poll loop                    |
| `tray.ts`                 | System tray icon, context menu, window positioning                           |
| `ipc.ts`                  | IPC handlers for renderer communication                                      |
| `googlemeet-events.swift` | Native EventKit helper (compiled to `/tmp/googlemeet/` at runtime)           |

## ENTRY POINT

`index.ts:14` — `createWindow()` called on `app.whenReady()`

## WINDOW CONFIG

```typescript
// index.ts:24-45
{
  width: 360, height: 480,
  show: false, frame: false, resizable: false, movable: false,
  alwaysOnTop: true, skipTaskbar: true,
  vibrancy: "popover", transparent: true, hasShadow: true,
  webPreferences: { sandbox: true, contextIsolation: true }
}
```

## SWIFT EVENTKIT PATTERNS

- **Helper**: `googlemeet-events.swift` compiled to `/tmp/googlemeet/googlemeet-events` on first call
- **Compile time**: <1s (`swiftc` invoked at runtime, cached)
- **Query time**: ~0.7s (EventKit indexed queries, no network waits)
- **Output format**: Tab-delimited `id\ttitle\tstartISO\tendISO\turl\tcalendar\tallDay\temail` (8 fields)
## IPC HANDLERS

| Channel                       | Handler                         |
| ----------------------------- | ------------------------------- |
| `calendar:get-events`         | `getCalendarEventsResult()`     |
| `calendar:request-permission` | `requestCalendarPermission()`   |
| `calendar:permission-status`  | `getCalendarPermissionStatus()` |
| `window:set-height`           | `win.setSize(360, height)`      |
| `app:open-external`           | `shell.openExternal(url)`       |
| `app:get-version`             | `app.getVersion()`              |

## TRAY BEHAVIOR

- Left/right click → pop up context menu
- Menu: Open, About, Quit (Cmd+Q)
- Window positioned below tray icon, clamped to screen bounds

## LIFECYCLE

- `close` event → `preventDefault()` + hide (never actually closes)
- `blur` event → hide (dev mode exempt)
- `before-quit` → `stopScheduler()` + destroy window, allow exit

## SCHEDULER

- **Poll interval**: Every 2 min (`POLL_INTERVAL_MS`)
- **Open-before**: 1 min (`OPEN_BEFORE_MS`)
- **Max schedule-ahead**: 24 h (events beyond are skipped until next poll)
- **`firedEvents` Set**: Prevents re-firing on refresh for already-opened events
- **Stale cleanup**: Timers for removed events are cancelled on each poll
- **URL**: `buildMeetUrl()` appends `?authuser=email` to Meet URL

## CODE MAP

| Symbol                    | Location               | Role                                          |
| ------------------------- | ---------------------- | --------------------------------------------- |
| `startScheduler`          | `scheduler.ts:330`     | Start poll loop + initial poll                |
| `stopScheduler`           | `scheduler.ts:342`     | Clear all timers on quit                      |
| `buildMeetUrl`            | `utils/meet-url.ts:7`  | Append `?authuser=email` to Meet URL         |
| `scheduleEvents`          | `scheduler.ts:87`      | Set/clear per-event `setTimeout` timers       |
| `poll`                    | `scheduler.ts:297`     | Calendar poll with error handling             |
| `getCalendarEventsResult` | `calendar.ts:144`      | Swift EventKit fetch (returns CalendarResult) |
| `parseEvents`             | `calendar.ts:91`       | Parse 8-field tab-delimited Swift output      |
| `setupTray`               | `tray.ts:29`           | System tray init                              |
| `registerIpcHandlers`     | `ipc.ts:44`            | IPC registration (validateSender pattern)     |
| `createWindow`            | `index.ts:38`          | BrowserWindow factory                         |
