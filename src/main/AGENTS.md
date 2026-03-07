# Main Process — Electron Main

Electron main process (Node.js). Handles app lifecycle, system tray, IPC, and macOS Calendar via Swift EventKit.

## FILES

| File                   | Role                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| `index.ts`             | App bootstrap, BrowserWindow factory, lifecycle events                  |
| `calendar.ts`          | Swift EventKit calendar queries (compiles/caches `googlemeet-events` binary) |
| `scheduler.ts`         | Auto-opens browser 1 min before meetings; 2-min poll loop               |
| `tray.ts`              | System tray icon, context menu, window positioning                      |
| `ipc.ts`               | IPC handlers for renderer communication                                 |
| `googlemeet-events.swift`  | Native EventKit helper (compiled to `/tmp/googlemeet/` at runtime)          |

## ENTRY POINT

`index.ts:14` — `createWindow()` called on `app.whenReady()`

## WINDOW CONFIG

```typescript
// index.ts:14-34
{
  width: 360, height: 480,
  frame: false, resizable: false, movable: false,
  alwaysOnTop: true, skipTaskbar: true,
  vibrancy: 'popover', transparent: true, hasShadow: true,
  webPreferences: { sandbox: true, contextIsolation: true }
}
```

## SWIFT EVENTKIT PATTERNS

- **Helper**: `googlemeet-events.swift` compiled to `/tmp/googlemeet/googlemeet-events` on first call
- **Compile time**: <1s (`swiftc` invoked at runtime, cached)
- **Query time**: ~0.7s (EventKit indexed queries, no network waits)
- **Output format**: Pipe-delimited `id||title||startISO||endISO||url||calendar||allDay||userEmail` (8 fields)
- **Date range**: Today midnight → +2 days
- **Permission checks**: Still use fast AppleScript (no event queries)
## IPC HANDLERS

| Channel                       | Handler                           |
| ----------------------------- | --------------------------------- |
| `calendar:get-events`         | `getCalendarEvents()`             |
| `calendar:request-permission` | `requestCalendarPermission()`     |
| `calendar:permission-status`  | `getCalendarPermissionStatus()`   |
| `window:minimize-to-tray`     | `win.hide()` + `app.dock?.hide()` |
| `window:restore`              | `win.show()` + `win.focus()`      |
| `app:open-external`           | `shell.openExternal(url)`         |
| `app:get-version`             | `app.getVersion()`                |

## TRAY BEHAVIOR

- Left/right click → pop up context menu
- Menu: Open, About, Quit (Cmd+Q)
- Window positioned below tray icon, clamped to screen bounds

## LIFECYCLE

- `close` event → `preventDefault()` + hide (never actually closes)
- `blur` event → hide (dev mode exempt)
- `before-quit` → `stopScheduler()` + destroy window, allow exit
- `window-all-closed` → no-op (tray-only app stays alive)

## SCHEDULER

- **Poll interval**: Every 2 min (`POLL_INTERVAL_MS`)
- **Open-before**: 1 min (`OPEN_BEFORE_MS`)
- **Max schedule-ahead**: 24 h (events beyond are skipped until next poll)
- **`firedEvents` Set**: Prevents re-firing on refresh for already-opened events
- **Stale cleanup**: Timers for removed events are cancelled on each poll
- **URL**: `buildMeetUrl()` appends `?authuser=email` when `userEmail` is present

## CODE MAP

| Symbol               | Location           | Role                                      |
| -------------------- | ------------------ | ----------------------------------------- |
| `startScheduler`     | `scheduler.ts:345` | Start poll loop + initial poll            |
| `stopScheduler`      | `scheduler.ts:357` | Clear all timers on quit                  |
| `buildMeetUrl`       | `scheduler.ts:56`  | Append `?authuser=email` to Meet URL      |
| `scheduleEvents`     | `scheduler.ts:102` | Set/clear per-event `setTimeout` timers   |
| `poll`               | `scheduler.ts:312` | Calendar poll with error handling         |
| `getCalendarEvents`  | `calendar.ts:148`  | Swift EventKit fetch (returns CalendarResult) |
| `parseEvents`        | `calendar.ts:95`   | Parse 8-field pipe-delimited Swift output |
| `setupTray`          | `tray.ts:17`       | System tray init                          |
| `registerIpcHandlers`| `ipc.ts:31`        | IPC registration (validateSender pattern) |
| `createWindow`       | `index.ts:24`      | BrowserWindow factory                     |

| Symbol               | Location           | Role                                      |
| -------------------- | ------------------ | ----------------------------------------- |
| `startScheduler`     | `scheduler.ts:105` | Start poll loop + initial poll            |
| `stopScheduler`      | `scheduler.ts:117` | Clear all timers on quit                  |
| `buildMeetUrl`       | `scheduler.ts:27`  | Append `?authuser=email` to Meet URL      |
| `scheduleEvents`     | `scheduler.ts:43`  | Set/clear per-event `setTimeout` timers   |
| `getCalendarEvents`  | `calendar.ts:125`  | Swift EventKit fetch                      |
| `parseEvents`        | `calendar.ts:72`   | Parse 8-field pipe-delimited Swift output |
| `setupTray`          | `tray.ts:18`       | System tray init                          |
| `registerIpcHandlers`| `ipc.ts:5`         | IPC registration                          |
| `createWindow`       | `index.ts:14`      | BrowserWindow factory                     |
