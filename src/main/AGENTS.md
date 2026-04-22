# Main Process — Electron Main

Electron main process (Node.js). Handles app lifecycle, system tray, IPC, macOS Calendar via Swift EventKit. Subsystem init orchestrated by `lifecycle.ts`.

## FILES

| File                 | Role                                                                   |
| -------------------- | ---------------------------------------------------------------------- |
| `index.ts`           | App bootstrap, BrowserWindow factory, lifecycle events                 |
| `lifecycle.ts`       | Subsystem init/shutdown (`initializeApp` / `shutdownApp`)              |
| `calendar.ts`        | Swift EventKit calendar queries (delegates to `swift/`), uses `isCalendarOk()` guard for discriminated `CalendarResult` |
| `tray.ts`            | System tray icon, context menu, window positioning, countdown title    |
| `ipc.ts`             | IPC registration (delegates to `ipc-handlers/`)                        |
| `settings.ts`        | Persistent app settings (JSON in userData)                             |
| `auto-launch.ts`     | macOS login items (launch at login)                                    |
| `settings-window.ts` | Settings BrowserWindow singleton (shows in Dock when open)             |
| `alert-window.ts`    | Full-screen meeting alert BrowserWindow (singleton)                    |
| `shortcuts.ts`       | Global keyboard shortcut (Cmd+Shift+M → join next meeting)             |
| `auto-updater.ts`    | Electron auto-updater (packaged builds only)                           |
| `notification.ts`    | macOS notification permission check                                    |
| `power.ts`           | Power management (battery-aware polling, ref-counted sleep prevention) |
| `scheduler/`         | Auto-launch browser before meetings (see `scheduler/AGENTS.md`)        |
| `swift/`             | Swift binary management + event parsing (see `swift/AGENTS.md`)        |
| `ipc-handlers/`      | IPC handler implementations (see below)                                |
| `menu/`              | Tray context menu (see below)                                          |
| `utils/`             | Main process utilities (see below)                                     |

## ENTRY POINT

`index.ts:42` — `createWindow()` called on `app.whenReady()`

## LIFECYCLE

`lifecycle.ts` orchestrates all subsystem init and shutdown:

```
initializeApp(win):
  registerIpcHandlers(win)  → ipc-handlers/ modules
  setupTray(win)            → tray.ts
  setTrayTitleCallback      → decouples scheduler from tray
  setSchedulerWindow(win)   → scheduler/index.ts
  startScheduler()          → scheduler/index.ts
  initPowerManagement(() => restartScheduler())  → power.ts
  registerShortcuts()       → shortcuts.ts
  syncAutoLaunch()          → auto-launch.ts
  checkNotificationPermission() → notification.ts

shutdownApp():
  cleanupPowerManagement()  → power.ts
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

- **Helper**: `googlemeet-events.swift` compiled to `$TMPDIR/googlemeet/` on first call
- **Binary manager**: `swift/binary-manager.ts` — hash-based cache, architecture-aware compile, retry on failure
- **Event parser**: `swift/event-parser.ts` — tab-delimited → `MeetingEvent[]`, Outlook artifact cleanup
- **Compile time**: <1s (`swiftc` invoked at runtime, cached)
- **Query time**: ~0.7s (EventKit indexed queries, no network waits)
- **Output format**: 9 tab-delimited fields: `uid\ttitle\tstartISO\tendISO\turl\tcalName\tallDay\temail\tnotes`
- **Filtering**: Skips cancelled events, declined invitations; only Google Meet URLs via regex
- **Type guards**: `swift/guards.ts` — runtime narrowing for Swift output fields, eliminates unsafe `as` casts

## IPC HANDLERS (`ipc-handlers/`)

Each domain has its own file. All exports `register*Handlers(win?)` called from `ipc.ts`.

| File          | Channels                                                                           | Notes                                                 |
| ------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `shared.ts`   | —                                                                                  | `typedHandle()`, `validateSender()`, height constants |
| `calendar.ts` | `calendar:get-events`, `calendar:request-permission`, `calendar:permission-status` | 3 invoke channels                                     |
| `settings.ts` | `settings:get`, `settings:set`                                                     | + pushes `settings:changed`                           |
| `app.ts`      | `app:open-external`, `app:get-version`                                             | 2 invoke channels                                     |
| `window.ts`   | `window:set-height`                                                                | Fire-and-forget (`ipcMain.on`)                        |

**Push channels** (main → renderer): use `typedSend()` from `ipc-handlers/shared.ts` with `isDestroyed()` guard.

| Channel                   | Trigger                            |
| ------------------------- | ---------------------------------- |
| `settings:changed`        | After `updateSettings()`           |
| `calendar:events-updated` | After successful `poll()`          |
| `alert:show`              | `showAlert()` 1 min before browser |

## TRAY CONTEXT MENU (`menu/`)

| File              | Role                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| `meeting-menu.ts` | `buildMeetingMenuTemplate()` — Today/Tomorrow groups, Join/InProgress labels |

## UTILITIES (`utils/`)

| File                | Export(s)                                                       | Role                                   | Consumers                            |
| ------------------- | --------------------------------------------------------------- | -------------------------------------- | ------------------------------------ |
| `browser-window.ts` | `SECURE_WEB_PREFERENCES`, `getPreloadPath`, `loadWindowContent` | All BrowserWindow creation             | index, settings-window, alert-window |
| `meet-url.ts`       | `buildMeetUrl`                                                  | Appends `?authuser=email`              | tray, shortcuts, scheduler           |
| `url-validation.ts` | `isAllowedMeetUrl`, `MEET_URL_ALLOWLIST`                        | URL allowlist for `shell.openExternal` | meet-url, ipc-handlers/app           |
| `packageInfo.ts`    | `getPackageInfo`                                                | Read package.json (9 explicit readonly fields, runtime validation) | index                                |

## ANTI-PATTERNS

- Never use `fs.readFileSync()` for tray icons — `nativeImage.createFromPath()` required (understands ASAR paths)
- Never bundle Swift source inside ASAR — `swiftc` cannot read from ASAR archives (see `asarUnpack` in `electron-builder.yml`)
- Never bypass `validateSender()` in IPC handlers — every handler must check sender origin
- Never change `SWIFT_SRC_DEV` relative path without verifying from bundled `lib/main/index.cjs` (see `swift/AGENTS.md`)
