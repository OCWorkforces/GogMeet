# Main Process — Electron Main

Electron main process (Node.js). Handles app lifecycle, system tray, IPC, then macOS Calendar via Swift EventKit.

## FILES

| File                      | Role                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- |
| `index.ts`                | App bootstrap, BrowserWindow factory, lifecycle events                       |
| `calendar.ts`             | Swift EventKit calendar queries (compiles/caches `googlemeet-events` binary) |
| `scheduler.ts`            | Auto-opens browser; 2-min poll loop, configurable open-before timing         |
| `tray.ts`                 | System tray icon, context menu, window positioning                           |
| `ipc.ts`                  | IPC handlers (calendar, window, app, settings)                               |
| `settings.ts`             | Persistent app settings (JSON in userData)                                   |
| `auto-launch.ts`          | macOS login items (launch at login)                                          |
| `settings-window.ts`      | Settings BrowserWindow singleton (shows in Dock when open)                   |
| `logger.ts`               | Structured logging utility                                                   |
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
| `settings:get`                | `getSettings()`                 |
| `settings:set`                | `updateSettings()`              |

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
- **Open-before**: Configurable 1-5 min via settings (default 1 min)
- **Title notification**: `TITLE_BEFORE_MS` (30 min before)
- **Max schedule-ahead**: 24 h (`MAX_SCHEDULE_AHEAD_MS`)
- **State maps**: `timers`, `titleTimers`, `countdownIntervals`, `clearTimers`, `inMeetingIntervals`, `inMeetingEndTimers`, `scheduledEventData`
- **`firedEvents` Set**: Prevents re-firing on refresh
- **Stale cleanup**: `cleanupStaleEntries()` each poll
- **URL**: `buildMeetUrl()` appends `?authuser=email`

## AUTO-LAUNCH

- `getAutoLaunchStatus()`: Reads `app.getLoginItemSettings().openAtLogin`
- `setAutoLaunch(enabled)`: Calls `app.setLoginItemSettings({ openAtLogin, openAsHidden: false })`
- `syncAutoLaunch(enabled)`: Syncs only if current state differs
- Called on app ready and when settings change

## CODE MAP

| Symbol                    | Location               | Role                                          |
| ------------------------- | ---------------------- | --------------------------------------------- |
| `startScheduler`          | `scheduler.ts:500`     | Start poll loop + initial poll                |
| `stopScheduler`           | `scheduler.ts:512`     | Clear all timers on quit                      |
| `restartScheduler`        | `scheduler.ts:545`     | Restart on settings change                    |
| `scheduleEvents`          | `scheduler.ts:223`     | Set/clear per-event `setTimeout` timers       |
| `poll`                    | `scheduler.ts:467`     | Calendar poll with error handling             |
| `getCalendarEventsResult` | `calendar.ts:144`      | Swift EventKit fetch (returns CalendarResult) |
| `parseEvents`             | `calendar.ts:91`       | Parse 8-field tab-delimited Swift output      |
| `ensureBinary`            | `calendar.ts`          | Compile/cache Swift binary with hash check    |
| `registerIpcHandlers`     | `ipc.ts:72`            | IPC registration (validateSender pattern)     |
| `typedHandle`             | `ipc.ts:62`            | Type-safe IPC wrapper                         |
| `validateSender`          | `ipc.ts:36`            | Origin validation against `ALLOWED_ORIGINS`   |
| `setupTray`               | `tray.ts:29`           | System tray init                              |
| `createWindow`            | `index.ts:38`          | BrowserWindow factory (tray popover)          |
| `createSettingsWindow`    | `settings-window.ts:15`| Settings BrowserWindow singleton              |
| `loadSettings`            | `settings.ts:32`       | Load from userData/settings.json              |
| `updateSettings`          | `settings.ts:72`       | Persist partial settings with clamping        |
| `getAutoLaunchStatus`     | `auto-launch.ts:7`     | Read macOS login item status                  |
| `setAutoLaunch`           | `auto-launch.ts:14`    | Set macOS login item                          |
| `syncAutoLaunch`          | `auto-launch.ts:26`    | Sync if state differs                         |
| `buildMeetUrl`            | `utils/meet-url.ts:7`  | Append `?authuser=email` to Meet URL          |
