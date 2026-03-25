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
| `alert-window.ts`         | Full-screen meeting alert BrowserWindow (singleton)                    |
| `shortcuts.ts`            | Global keyboard shortcut (Cmd+Shift+M → join next meeting)            |
| `auto-updater.ts`         | Electron auto-updater (packaged builds only)                         |
| `notification.ts`          | macOS notification permission check                                        |
| `googlemeet-events.swift` | Native EventKit helper (compiled to `/tmp/googlemeet/` at runtime)           |
| `utils/`                  | Main process utilities                                                     |
| `utils/meet-url.ts`       | Appends `?authuser=email` to Meet URL                                     |
| `utils/url-validation.ts` | URL allowlist validation for `shell.openExternal`                           |
| `utils/packageInfo.ts`    | Reads package.json at runtime                                              |

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

**Push channels** (main → renderer via `win.webContents.send()`):

| Channel                    | Trigger                    |
| -------------------------- | -------------------------- |
| `settings:changed`          | After `updateSettings()`     |
| `calendar:events-updated`   | After successful `poll()`   |
TJ|| `alert:show`              | `showAlert()` sends title + meetUrl to alert window; alert fires 1 min before browser timer                

## TRAY BEHAVIOR

| Left/right click → pop up context menu
| Menu: Open, About, Quit (Cmd+Q)
| Window positioned below tray icon, clamped to screen bounds
| Countdown shown in tray title via `updateTrayTitle()`

## LIFECYCLE

- `close` event → `preventDefault()` + hide (never actually closes)
- `blur` event → hide (dev mode exempt)
- `before-quit` → `stopScheduler()` + destroy window, allow exit

## SCHEDULER

- **Poll interval**: Every 2 min (`POLL_INTERVAL_MS`)
- **Open-before**: Configurable 1-5 min via settings (default 1 min)
- **Title notification**: `TITLE_BEFORE_MS` (30 min before)
- **Max schedule-ahead**: 24 h (`MAX_SCHEDULE_AHEAD_MS`)
JK|- **State maps**: `timers`, `alertTimers`, `titleTimers`, `countdownIntervals`, `clearTimers`, `inMeetingIntervals`, `inMeetingEndTimers`, `scheduledEventData`
QB|- **`firedEvents` Set**: Prevents browser-open re-fire on refresh
QT|- **`alertFiredEvents` Set**: Prevents alert re-fire on refresh
QF|- **Alert offset**: `ALERT_OFFSET_MS = 60 * 1000` — alert fires 1 min before browser timer
BH|- **Browser auto-open suppressed**: When alert was already shown (user joins via alert button)
- **URL**: `buildMeetUrl()` appends `?authuser=email`

## AUTO-LAUNCH

- `getAutoLaunchStatus()`: Reads `app.getLoginItemSettings().openAtLogin`
- `setAutoLaunch(enabled)`: Calls `app.setLoginItemSettings({ openAtLogin, openAsHidden: false })`
- `syncAutoLaunch(enabled)`: Syncs only if current state differs
- Called on app ready and when settings change

## CODE MAP

| Symbol                        | Location               | Role                                          |
| ------------------------- | ---------------------- | --------------------------------------------- |
| `startScheduler`          | `scheduler.ts:755`     | Start poll loop + initial poll                |
| `stopScheduler`           | `scheduler.ts:767`     | Clear all timers on quit                       |
| `restartScheduler`        | `scheduler.ts:774`     | Restart on settings change                    |
TY|| `scheduleEvents`          | `scheduler.ts:372`     | Set/clear per-event `setTimeout` timers       
MB|| `poll`                    | `scheduler.ts:681`     | Calendar poll with error handling             
VX|| `alertTimers`            | `scheduler.ts:179`     | Map of eventId → alert timer (fires 1 min before browser)
QT|| `alertFiredEvents`        | `scheduler.ts:203`     | Set of eventIds that already showed alert     
| `getCalendarEventsResult` | `calendar.ts:224`      | Swift EventKit fetch (returns CalendarResult) |
| `parseEvents`             | `calendar.ts:149`      | Parse 8-field tab-delimited Swift output      |
| `ensureBinary`            | `calendar.ts`          | Compile/cache Swift binary with hash check    |
| `registerIpcHandlers`     | `ipc.ts:74`            | IPC registration (validateSender pattern)     |
| `typedHandle`             | `ipc.ts:62`            | Type-safe IPC wrapper                         |
| `validateSender`          | `ipc.ts:36`            | Origin validation against `ALLOWED_ORIGINS`   |
| `setupTray`               | `tray.ts:60`           | System tray init                              |
| `createWindow`            | `index.ts:49`          | BrowserWindow factory (tray popover)          |
| `showAlert`               | `alert-window.ts:11`   | Full-screen alert BrowserWindow singleton      |
| `createSettingsWindow`    | `settings-window.ts:15`| Settings BrowserWindow singleton              |
| `registerShortcuts`       | `shortcuts.ts:8`       | Global shortcut Cmd+Shift+M                   |
| `initAutoUpdater`         | `auto-updater.ts:10`   | electron-updater setup (packaged only)        |
| `loadSettings`            | `settings.ts:32`       | Load from userData/settings.json              |
| `updateSettings`          | `settings.ts:93`       | Persist partial settings with clamping        |
| `getAutoLaunchStatus`     | `auto-launch.ts:7`     | Read macOS login item status                  |
| `setAutoLaunch`           | `auto-launch.ts:21`    | Set macOS login item                          |
| `syncAutoLaunch`          | `auto-launch.ts:40`    | Sync if state differs                         |
| `buildMeetUrl`            | `utils/meet-url.ts:9`  | Append `?authuser=email` to Meet URL          |
| `isAllowedMeetUrl`        | `utils/url-validation.ts:9` | Validates URL against MEET_URL_ALLOWLIST      |
| `MEET_URL_ALLOWLIST`      | `utils/url-validation.ts` | Google domains for `shell.openExternal`       |
| `getPackageInfo`          | `utils/packageInfo.ts:37` | Read package.json at runtime                   |
| `formatRemainingTime`     | `tray.ts:212`          | Format countdown for tray title               |
| `updateTrayTitle`         | `tray.ts:227`          | Set tray title with countdown                 |
| `checkNotificationPermission` | `notification.ts:26`  | macOS notification permission prompt           |
| `getSettings`             | `settings.ts:89`       | Get cached settings (used in tray for showTomorrowMeetings) |


## ANTI-PATTERNS

- Never use `fs.readFileSync()` for tray icons — `nativeImage.createFromPath()` required (understands ASAR paths)
- Never bundle Swift source inside ASAR — `swiftc` cannot read from ASAR archives (see `asarUnpack` in `electron-builder.yml`)
- Never bypass `validateSender()` in IPC handlers — every handler must check sender origin
