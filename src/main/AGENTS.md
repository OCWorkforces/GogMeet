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
- **Hash check**: `computeSwiftSourceHash()` + `HASH_PATH` — recompiles only when source changes
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
- **Open-before**: 1 min (`OPEN_BEFORE_MS`); title notification at `TITLE_BEFORE_MS`
- **Max schedule-ahead**: 24 h (`MAX_SCHEDULE_AHEAD_MS` — events beyond are skipped until next poll)
- **`firedEvents` Set**: Prevents re-firing on refresh for already-opened events
- **`countdownIntervals`**: Separate map for countdown timers alongside `timers`
- **Stale cleanup**: `cleanupStaleEntries()` cancels timers for removed events each poll
- **URL**: `buildMeetUrl()` appends `?authuser=email` to Meet URL

## CODE MAP

| Symbol                    | Location               | Role                                          |
| ------------------------- | ---------------------- | --------------------------------------------- |
| `startScheduler`          | `scheduler.ts:496`     | Start poll loop + initial poll                |
| `stopScheduler`           | `scheduler.ts:508`     | Clear all timers on quit                      |
| `scheduleEvents`          | `scheduler.ts:219`     | Set/clear per-event `setTimeout` timers       |
| `poll`                    | `scheduler.ts:463`     | Calendar poll with error handling             |
| `getCalendarEventsResult` | `calendar.ts:144`      | Swift EventKit fetch (returns CalendarResult) |
| `parseEvents`             | `calendar.ts:91`       | Parse 8-field tab-delimited Swift output      |
| `ensureBinary`            | `calendar.ts`          | Compile/cache Swift binary with hash check    |
| `registerIpcHandlers`     | `ipc.ts:68`            | IPC registration (validateSender pattern)     |
| `typedHandle`             | `ipc.ts:58`            | Type-safe IPC wrapper                         |
| `validateSender`          | `ipc.ts:32`            | Origin validation against `ALLOWED_ORIGINS`   |
| `setupTray`               | `tray.ts:29`           | System tray init                              |
| `createWindow`            | `index.ts:38`          | BrowserWindow factory                         |
| `buildMeetUrl`            | `utils/meet-url.ts:7`  | Append `?authuser=email` to Meet URL          |
