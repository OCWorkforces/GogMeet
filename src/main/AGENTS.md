# Main Process — Electron Main

Electron main process (Node.js). Handles app lifecycle, system tray, IPC, macOS Calendar via Swift EventKit. Subsystem init orchestrated by `lifecycle.ts`.

## FILES

| File                      | Role                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- |
| `index.ts`                | App bootstrap, BrowserWindow factory, lifecycle events                       |
| `lifecycle.ts`            | Subsystem init/shutdown (`initializeApp` / `shutdownApp`)                    |
| `calendar.ts`             | Swift EventKit calendar queries (compiles/caches `googlemeet-events` binary) |
| `tray.ts`                 | System tray icon, context menu, window positioning                           |
| `ipc.ts`                  | IPC registration (delegates to `ipc-handlers/`)                              |
| `settings.ts`             | Persistent app settings (JSON in userData)                                   |
| `auto-launch.ts`          | macOS login items (launch at login)                                          |
| `settings-window.ts`      | Settings BrowserWindow singleton (shows in Dock when open)                   |
| `alert-window.ts`         | Full-screen meeting alert BrowserWindow (singleton)                          |
| `shortcuts.ts`            | Global keyboard shortcut (Cmd+Shift+M → join next meeting)                   |
| `auto-updater.ts`         | Electron auto-updater (packaged builds only)                                 |
| `notification.ts`         | macOS notification permission check                                          |
| `googlemeet-events.swift` | Native EventKit helper (compiled to `/tmp/googlemeet/` at runtime)           |
| `scheduler/`              | Auto-launch browser before meetings (see `scheduler/AGENTS.md`)              |
| `ipc-handlers/`           | IPC handler implementations (see below)                                      |
| `utils/`                  | Main process utilities (see below)                                           |

## ENTRY POINT

`index.ts:14` — `createWindow()` called on `app.whenReady()`

## LIFECYCLE

`lifecycle.ts` orchestrates all subsystem init and shutdown:

```
initializeApp(win):
  registerIpcHandlers(win)  → ipc-handlers/ modules
  setupTray(win)            → tray.ts
  setTrayTitleCallback      → decouples scheduler from tray
  setSchedulerWindow(win)   → scheduler/index.ts
  startScheduler()          → scheduler/index.ts
  registerShortcuts()       → shortcuts.ts
  checkNotificationPermission()
  syncAutoLaunch()          → auto-launch.ts

shutdownApp():
  stopScheduler()           → scheduler/index.ts
```

## WINDOW CONFIG

```typescript
// index.ts:42-59 — shared config in utils/browser-window.ts
{
  width: 360, height: 480,
  show: false, frame: false, resizable: false, movable: false,
  alwaysOnTop: true, skipTaskbar: true,
  vibrancy: "popover", transparent: true, hasShadow: true,
  webPreferences: SECURE_WEB_PREFERENCES  // sandbox + contextIsolation
}
```

## SWIFT EVENTKIT PATTERNS

- **Helper**: `googlemeet-events.swift` compiled to `/tmp/googlemeet/googlemeet-events` on first call
- **Hash check**: `computeSwiftSourceHash()` + `HASH_PATH` — recompiles only when source changes
- **Compile time**: <1s (`swiftc` invoked at runtime, cached)
- **Query time**: ~0.7s (EventKit indexed queries, no network waits)
- **Output format**: 9 tab-delimited fields: `uid\ttitle\tstartISO\tendISO\turl\tcalName\tallDay\temail\tnotes`
- **Filtering**: Skips cancelled events, declined invitations; only Google Meet URLs via regex

## IPC HANDLERS (`ipc-handlers/`)

Each domain has its own file. All exports `register*Handlers(win?)` called from `ipc.ts`.

| File          | Channels                                                      | Notes                          |
| ------------- | ------------------------------------------------------------- | ------------------------------ |
| `shared.ts`   | —                                                             | `typedHandle()`, `validateSender()`, height constants |
| `calendar.ts` | `calendar:get-events`, `calendar:request-permission`, `calendar:permission-status` | 3 invoke channels |
| `settings.ts` | `settings:get`, `settings:set`                                | + pushes `settings:changed`    |
| `app.ts`      | `app:open-external`, `app:get-version`                        | 2 invoke channels              |
| `window.ts`   | `window:set-height`                                           | Fire-and-forget (`ipcMain.on`) |

**Push channels** (main → renderer via `win.webContents.send()`):

| Channel                   | Trigger                         |
| ------------------------- | ------------------------------- |
| `settings:changed`        | After `updateSettings()`        |
| `calendar:events-updated` | After successful `poll()`       |
| `alert:show`              | `showAlert()` 1 min before browser |

## UTILITIES (`utils/`)

| File                | Export(s)                     | Role                                 | Consumers                       |
| ------------------- | ----------------------------- | ------------------------------------ | ------------------------------- |
| `browser-window.ts` | `SECURE_WEB_PREFERENCES`, `getPreloadPath`, `loadWindowContent` | All BrowserWindow creation | index, settings-window, alert-window |
| `meet-url.ts`       | `buildMeetUrl`                | Appends `?authuser=email`            | tray, shortcuts, scheduler      |
| `url-validation.ts` | `isAllowedMeetUrl`, `MEET_URL_ALLOWLIST` | URL allowlist for `shell.openExternal` | meet-url, ipc-handlers/app |
| `packageInfo.ts`    | `getPackageInfo`              | Read package.json at runtime (frozen) | index                           |

## TRAY BEHAVIOR

| Left/right click → pop up context menu
| Menu: Open, About, Quit (Cmd+Q)
| Window positioned below tray icon, clamped to screen bounds
| Countdown shown in tray title via `updateTrayTitle()`

## SCHEDULER (`scheduler/`)

See `scheduler/AGENTS.md` for full details. Key points:

- **Poll interval**: Every 2 min (`POLL_INTERVAL_MS`)
- **Open-before**: Configurable 1-5 min via settings (default 1 min)
- **Alert offset**: 1 min before browser open (`ALERT_OFFSET_MS`)
- **Title notification**: 30 min before (`TITLE_BEFORE_MS`)
- **Max schedule-ahead**: 24 h (`MAX_SCHEDULE_AHEAD_MS`)
- **8 timer maps**: timers, alertTimers, titleTimers, countdownIntervals, clearTimers, inMeetingIntervals, inMeetingEndTimers, scheduledEventData
- **2 fired-event Sets**: firedEvents, alertFiredEvents
- **Proxy view pattern**: state.ts exports Proxy views over Maps/Sets for transparent state access
- **Callback decoupling**: `setTrayTitleCallback` breaks scheduler→tray dependency

## AUTO-LAUNCH

- `getAutoLaunchStatus()`: Reads `app.getLoginItemSettings().openAtLogin`
- `setAutoLaunch(enabled)`: Calls `app.setLoginItemSettings({ openAtLogin, openAsHidden: false })`
- `syncAutoLaunch(enabled)`: Syncs only if current state differs
- Called on app ready and when settings change

## CODE MAP

| Symbol                        | Location                          | Role                                          |
| ------------------------- | --------------------------------- | --------------------------------------------- |
| `initializeApp`           | `lifecycle.ts:20`                 | Subsystem init orchestration                  |
| `shutdownApp`             | `lifecycle.ts:40`                 | Stop scheduler on quit                        |
| `startScheduler`          | `scheduler/index.ts:466`          | Start poll loop + initial poll                |
| `stopScheduler`           | `scheduler/index.ts:478`          | Clear all timers on quit                      |
| `restartScheduler`        | `scheduler/index.ts:485`          | Restart on settings change                    |
| `scheduleEvents`          | `scheduler/index.ts:80`           | Set/clear per-event `setTimeout` timers       |
| `poll`                    | `scheduler/index.ts:429`          | Calendar poll with error handling             |
| `registerIpcHandlers`     | `ipc.ts:11`                       | IPC registration (delegates to ipc-handlers/) |
| `typedHandle`             | `ipc-handlers/shared.ts:42`       | Type-safe IPC wrapper                         |
| `validateSender`          | `ipc-handlers/shared.ts:15`       | Origin validation against `ALLOWED_ORIGINS`   |
| `getCalendarEventsResult` | `calendar.ts:247`                 | Swift EventKit fetch (returns CalendarResult) |
| `parseEvents`             | `calendar.ts:172`                 | Parse 9-field tab-delimited Swift output      |
| `ensureBinary`            | `calendar.ts:44`                  | Compile/cache Swift binary with hash check    |
| `setupTray`               | `tray.ts:60`                      | System tray init                              |
| `createWindow`            | `index.ts:42`                     | BrowserWindow factory (tray popover)          |
| `showAlert`               | `alert-window.ts:11`              | Full-screen alert BrowserWindow singleton     |
| `createSettingsWindow`    | `settings-window.ts:15`           | Settings BrowserWindow singleton              |
| `registerShortcuts`       | `shortcuts.ts:8`                  | Global shortcut Cmd+Shift+M                   |
| `initAutoUpdater`         | `auto-updater.ts:10`              | electron-updater setup (packaged only)        |
| `getSettings`             | `settings.ts:89`                  | Load settings (returns merged defaults)       |
| `updateSettings`          | `settings.ts:93`                  | Persist partial settings with clamping        |
| `buildMeetUrl`            | `utils/meet-url.ts:9`             | Append `?authuser=email` to Meet URL          |
| `isAllowedMeetUrl`        | `utils/url-validation.ts:9`       | Validates URL against MEET_URL_ALLOWLIST      |
| `formatRemainingTime`     | `tray.ts:216`                     | Format countdown for tray title               |
| `updateTrayTitle`         | `tray.ts:231`                     | Set tray title with countdown                 |
| `checkNotificationPermission` | `notification.ts:26`           | macOS notification permission prompt           |

## ANTI-PATTERNS

- Never use `fs.readFileSync()` for tray icons — `nativeImage.createFromPath()` required (understands ASAR paths)
- Never bundle Swift source inside ASAR — `swiftc` cannot read from ASAR archives (see `asarUnpack` in `electron-builder.yml`)
- Never bypass `validateSender()` in IPC handlers — every handler must check sender origin
