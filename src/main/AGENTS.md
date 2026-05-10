# Main Process — Electron Main

Electron main process (Node.js). Handles app lifecycle, system tray, IPC, macOS Calendar via Swift EventKit. Subsystem init orchestrated by `app/lifecycle.ts`. Code organized by concern: `app/` (orchestration), `windows/` (BrowserWindow singletons), `system/` (OS integration), `domain/` (calendar + settings), plus subsystem dirs (`scheduler/`, `swift/`, `ipc-handlers/`, `menu/`, `utils/`).

## FILES

### Root (cross-cutting)

| File         | Role                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `index.ts`   | Rslib entry point, app bootstrap, BrowserWindow factory, lifecycle events                       |
| `tray.ts`    | System tray icon, context menu, countdown title; subscribes to `meeting-list-updated` event bus |
| `events.ts`  | Typed event bus (`TypedMainEventBus`, `MainEvents`): `meeting-list-updated` + `power-state-changed`, singleton `mainBus` |

### `app/` — application orchestration

| File           | Role                                                                                |
| -------------- | ----------------------------------------------------------------------------------- |
| `lifecycle.ts` | Subsystem init/shutdown orchestrator (`initializeApp` / `shutdownApp`)              |
| `ipc.ts`       | IPC registration (delegates to `ipc-handlers/`)                                     |

### `windows/` — BrowserWindow singletons

| File                 | Role                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- |
| `about-window.ts`    | About panel BrowserWindow singleton (reuses window, alwaysOnTop, hiddenInset titlebar) |
| `alert-window.ts`    | Full-screen meeting alert BrowserWindow (singleton, coalesces by uid)                 |
| `settings-window.ts` | Settings BrowserWindow singleton (shows in Dock when open)                            |

### `system/` — OS integration

| File               | Role                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| `power.ts`         | Power management (battery-aware polling, ref-counted sleep prevention)     |
| `auto-launch.ts`   | macOS login items (launch at login)                                        |
| `auto-updater.ts`  | Electron auto-updater (packaged builds only)                               |
| `notification.ts`  | macOS notification permission check                                        |
| `shortcuts.ts`     | Global keyboard shortcut (Cmd+Shift+M → join next meeting)                 |

### `domain/` — calendar + settings business logic

| File                  | Role                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `calendar.ts`         | Swift EventKit calendar queries (imports directly from `swift/`, does NOT re-export); uses `isCalendarOk()` guard for discriminated `CalendarResult` |
| `calendar-watcher.ts` | macOS Calendar change detection via Swift `--watch` sidecar (`EKEventStoreChangedNotification`), triggers `forcePoll()` on changes |
| `settings.ts`         | Persistent app settings (JSON in userData), legacy key migration on load                                            |

### Subsystem directories (own AGENTS.md)

| Directory        | Role                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `scheduler/`     | Auto-launch browser before meetings; `facade.ts` is the sole public entry point (see `scheduler/AGENTS.md`) |
| `swift/`         | Swift binary management + event parsing (see `swift/AGENTS.md`)                               |
| `ipc-handlers/`  | IPC handler implementations (see below)                                                       |
| `menu/`          | Tray context menu (see below)                                                                 |
| `utils/`         | Main process utilities (see below)                                                            |

## ARCHITECTURE

**Layered organization** (no cycles, see `.sentrux/rules.toml`):

- **Root files** (`index.ts`, `tray.ts`, `events.ts`) — cross-cutting concerns; the event bus is the decoupling seam between scheduler and tray.
- **`app/`** — orchestrates everything else; depends on all other layers, depended on by none.
- **`windows/`, `system/`, `domain/`** — sibling concerns; cross-imports kept minimal and unidirectional.
- **`scheduler/`** — self-contained; **`scheduler/facade.ts` is the sole public entry point**. It now contains the actual function bodies (`forcePoll`, `startScheduler`, `stopScheduler`, `restartScheduler`, `setSchedulerWindow`), no longer a re-export shim. External consumers MUST import from `scheduler/facade.js`, never from `scheduler/index.js` or internal files.
- **`scheduler/state/`** — 5 files (`index.ts` composition root, `state-timers.ts`, `state-display.ts`, `state-poll.ts`, `state-runtime.ts`). State accessed only via typed getter functions; no module-level `let` exports.
- **`swift/`** — leaf subsystem; `domain/calendar.ts` imports its functions directly (no re-export barrel).
- **`ipc-handlers/`, `menu/`, `utils/`** — leaf utilities; depended on by `app/`, `windows/`, `domain/`, etc.

## ENTRY POINT

`index.ts:42` — `createWindow()` called on `app.whenReady()`

## LIFECYCLE

`app/lifecycle.ts` orchestrates all subsystem init and shutdown:

```
initializeApp(win):
  loadSettings()             → domain/settings.ts (must be first)
  registerIpcHandlers(win)  → ipc-handlers/ modules
  setupTray(win)            → tray.ts (1 arg; fires forcePoll() in background on click)
  setTrayTitleCallback      → decouples scheduler from tray
  setSchedulerWindow(win)   → scheduler/facade.ts
  calendarPermission        → domain/calendar.ts
  startScheduler()          → scheduler/facade.ts
  startCalendarWatcher()    → domain/calendar-watcher.ts (Swift EKEventStoreChangedNotification sidecar)
  initPowerManagement(() => restartScheduler())  → system/power.ts
  initPowerEvents()              → system/power.ts (emits power-state-changed on battery change)
  registerShortcuts()       → system/shortcuts.ts
  checkNotificationPermission() → system/notification.ts
  syncAutoLaunch()          → system/auto-launch.ts

shutdownApp():
  cleanupPowerManagement()  → system/power.ts
  stopScheduler()           → scheduler/facade.ts
  stopCalendarWatcher()     → domain/calendar-watcher.ts
```

**Error handling**: Fatal init failures wrapped via `tryRun`/`tryRunAsync`; errors normalized through `AppError` taxonomy in `shared/errors.ts` (6 variants), shown via `dialog.showErrorBox()` on fatal.

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
- **Helper modes**:
  - **One-shot** (default): fetches today+tomorrow events, outputs 9-field tab-delimited format, exits
  - **`--watch`**: runs indefinitely, subscribes to `EKEventStoreChangedNotification`, outputs `CHANGED` on stdout (1s debounce) when Calendar data mutates
- **Watch sidecar**: `swift/calendar-watch-sidecar.ts` — manages the long-running `--watch` process lifecycle (spawn, crash recovery with exponential backoff, graceful shutdown)
- **Binary manager**: `swift/binary-manager.ts` — hash-based cache, architecture-aware compile, retry on failure
- **Event parser**: `swift/event-parser.ts` — tab-delimited → `MeetingEvent[]`, Outlook artifact cleanup
- **Compile time**: <1s (`swiftc` invoked at runtime, cached)
- **Query time**: ~0.7s (EventKit indexed queries, no network waits)
- **Output format**: 9 tab-delimited fields: `uid\ttitle\tstartISO\tendISO\turl\tcalName\tallDay\temail\tnotes`
- **Filtering**: Skips cancelled events, declined invitations; Google Meet + Zoom URLs via regex
- **Type guards**: `swift/guards.ts` — runtime narrowing for Swift output fields, eliminates unsafe `as` casts

## IPC HANDLERS (`ipc-handlers/`)

Each domain has its own file. All exports `register*Handlers(win?)` called from `ipc.ts`.

| File          | Channels                                                                           | Notes                                                 |
| ------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `shared.ts`   | —                                                                                  | `typedHandle()`, `validateSender()`, height constants |
| `calendar.ts` | `calendar:get-events`, `calendar:request-permission`, `calendar:permission-status` | 3 invoke channels                                     |
| `settings.ts` | `settings:get`, `settings:set`                                                     | + pushes `settings:changed`                           |
| `app.ts`      | `app:open-external`, `app:get-version`                                             | 2 invoke channels; `app:open-external` payload is `{url: MeetUrl}` (branded) |
| `window.ts`   | `window:set-height`                                                                | Fire-and-forget (`ipcMain.on`)                        |
| `scheduler.ts`| `scheduler:force-poll`                                                             | Fire-and-forget (`ipcMain.on`), triggers `forcePoll()` |

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
| `url-validation.ts` | `isAllowedMeetUrl`, `MEETING_URL_ALLOWLIST`                        | Meeting URL allowlist for `shell.openExternal` | meet-url, ipc-handlers/app           |
| `packageInfo.ts`    | `getPackageInfo`                                                | Read package.json (9 explicit readonly fields, runtime validation) | index                                |

## ANTI-PATTERNS

- Never use `fs.readFileSync()` for tray icons — `nativeImage.createFromPath()` required (understands ASAR paths)
- Never bundle Swift source inside ASAR — `swiftc` cannot read from ASAR archives (see `asarUnpack` in `electron-builder.yml`)
- Never bypass `validateSender()` in IPC handlers — every handler must check sender origin
- Never change `SWIFT_SRC_DEV` relative path without verifying from bundled `lib/main/index.cjs` (see `swift/AGENTS.md`)
- `index.ts` suppresses Chromium DNS sorter warnings via `app.commandLine.appendSwitch("log-level", "3")` — this filters WARNING-level Chromium messages from VPN/virtual interfaces (Chromium bug 40445828); do NOT remove
- `domain/settings.ts` migrates legacy `fullScreenAlert` → `windowAlert` key on load — preserve this migration when adding new settings keys
- Never use dot notation on index-signature types — use bracket notation (`obj["key"]`); `noPropertyAccessFromIndexSignature` is enabled
