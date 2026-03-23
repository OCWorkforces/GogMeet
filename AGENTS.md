# GogMeet — Project Knowledge Base

**Generated:** 2026-03-22
**Commit:** fb362b3
**Branch:** develop

## OVERVIEW

macOS tray-only Electron app for Google Meet calendar reminders. Fetches events via Swift EventKit from macOS Calendar, auto-opens meetings in browser 1 min before start, displays upcoming meetings in a native popover UI. Supports full-screen meeting alerts (1 min before browser open) and auto-updates.

| Layer     | Tech                                      |
| --------- | ----------------------------------------- |
| Runtime   | Bun 1.3.10+ / Node.js 24.14.0+            |
| Framework | Electron 41                               |
| Build     | Rslib (main/preload) + Rsbuild (renderer) |
| Package   | Bun                                       |
Test      | Vitest 4 (workspace, 121 tests)           

## STRUCTURE

```
src/
├── main/             # Electron main process (Node.js)
│   ├── index.ts      # App bootstrap, window, lifecycle
│   ├── calendar.ts   # Swift EventKit calendar integration
│   ├── scheduler.ts  # Auto-launch browser before meetings
│   ├── tray.ts       # System tray icon + menu
│   ├── ipc.ts        # IPC handlers (calendar, window, app, settings)
│   ├── settings.ts   # Persistent app settings (JSON in userData)
│   ├── auto-launch.ts # macOS login items (launch at login)
│   ├── settings-window.ts # Settings BrowserWindow singleton
│   ├── alert-window.ts   # Full-screen meeting alert BrowserWindow
│   ├── shortcuts.ts      # Global keyboard shortcut (Cmd+Shift+M)
│   ├── auto-updater.ts   # Electron auto-updater (packaged builds)
│   ├── notification.ts   # Notification permission check
│   ├── logger.ts         # Structured logging utility (unused)
│   ├── googlemeet-events.swift  # Native EventKit helper (compiled at runtime)
│   └── utils/        # Main process utilities
│       ├── meet-url.ts       # buildMeetUrl with ?authuser=email
│       ├── url-validation.ts # MEET_URL_ALLOWLIST for shell.openExternal
│       └── packageInfo.ts    # Read package.json at runtime
├── renderer/         # UI (web context, vanilla TS)
│   ├── index.ts      # Main UI logic, state machine
│   ├── index.html    # CSP-protected template
│   ├── settings/     # Settings window (separate entry)
│   │   ├── index.ts  # Settings form logic
│   │   ├── index.html
│   │   └── styles.css # iOS-style toggles
│   ├── alert/        # Full-screen meeting alert (separate entry)
│   │   ├── index.ts  # Alert overlay logic
│   │   ├── index.html
│   │   └── styles.css # Dark full-screen styles
│   └── styles/       # CSS (dark mode native aesthetic)
│       └── main.css
├── preload/          # Context bridge (sandbox)
│   └── index.ts      # Exposes window.api to renderer
├── shared/           # Types shared across processes
│   ├── types.ts      # IPC_CHANNELS, MeetingEvent, AppSettings
│   └── utils/        # Cross-process utilities
│       └── escape-html.ts # XSS protection
└── tests/            # Vitest tests (main/renderer workspaces)
    ├── setup.main.ts # Electron mock for main process
    ├── main/         # Scheduler, calendar, IPC, settings, auto-launch, tray, meet-url tests
    └── renderer/     # Event delegation, XSS tests
```

## WHERE TO LOOK

| Task                  | Location                               | Notes                                                         |
| --------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Add IPC channel       | `src/shared/types.ts` → `IPC_CHANNELS` | Single source of truth                                        |
| Implement IPC handler | `src/main/ipc.ts`                      | Register with `typedHandle()`                                 |
| Expose to renderer    | `src/preload/index.ts`                 | Add to `api` object                                           |
| Use in UI             | `src/renderer/index.ts`                | Call via `window.api.*`                                       |
| Calendar logic        | `src/main/calendar.ts`                 | Swift EventKit via compiled binary                            |
| Auto-launch scheduler | `src/main/scheduler.ts`                | `startScheduler` / `stopScheduler` / `restartScheduler`       |
| Launch at login       | `src/main/auto-launch.ts`              | `getAutoLaunchStatus` / `setAutoLaunch` / `syncAutoLaunch`    |
| Swift EventKit output | `src/main/googlemeet-events.swift`     | Tab-delimited: id\ttitle\tstart\tend\turl\tcal\tallDay\temail |
| User settings         | `src/main/settings.ts`                 | JSON in userData, clamped to min/max                          |
| Settings window       | `src/main/settings-window.ts`          | Singleton BrowserWindow, shows in Dock                        |
| Alert window          | `src/main/alert-window.ts`             | Full-screen overlay, singleton, dismissed by Escape           |
| Global shortcut       | `src/main/shortcuts.ts`                | Cmd+Shift+M → join next meeting                               |
| Auto-updater          | `src/main/auto-updater.ts`             | electron-updater, packaged builds only                        |
| UI state              | `src/renderer/index.ts`                | `AppState` type union                                         |
| Window config         | `src/main/index.ts`                    | `createWindow()`                                              |
| Tray behavior         | `src/main/tray.ts`                     | Menu, positioning                                             |
| URL validation        | `src/main/utils/url-validation.ts`     | `MEET_URL_ALLOWLIST` for `shell.openExternal`                 |
| Build config          | `rslib.config.ts`, `rsbuild.config.ts` | Separate for each process                                     |

## CODE MAP

| Symbol                        | Type  | Location                           | Role                                                                                                                |
| ----------------------------- | ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `createWindow`                | fn    | src/main/index.ts:44               | BrowserWindow factory                                                                                               |
| `setupTray`                   | fn    | src/main/tray.ts:60                | System tray init                                                                                                    |
| `showAlert`                   | fn    | src/main/alert-window.ts:16        | Full-screen alert BrowserWindow                                                                                     |
| `registerShortcuts`           | fn    | src/main/shortcuts.ts:8            | Global shortcut Cmd+Shift+M                                                                                         |
| `initAutoUpdater`             | fn    | src/main/auto-updater.ts:10        | electron-updater setup (packaged only)                                                                              |
| `registerIpcHandlers`         | fn    | src/main/ipc.ts:74                 | IPC registration                                                                                                    |
| `typedHandle`                 | fn    | src/main/ipc.ts:62                 | Type-safe IPC wrapper                                                                                               |
| `validateSender`              | fn    | src/main/ipc.ts:36                 | Origin validation against ALLOWED_ORIGINS                                                                           |
| `getCalendarEventsResult`     | fn    | src/main/calendar.ts:217           | Swift EventKit fetch                                                                                                |
| `parseEvents`                 | fn    | src/main/calendar.ts:145           | Parses tab-delimited Swift output                                                                                   |
| `requestCalendarPermission`   | fn    | src/main/calendar.ts:239           | macOS EventKit permission prompt                                                                                    |
| `getCalendarPermissionStatus` | fn    | src/main/calendar.ts:253           | Read current calendar permission                                                                                    |
`startScheduler`              | fn    | src/main/scheduler.ts:718          | Start poll loop                                                                                                     
`stopScheduler`               | fn    | src/main/scheduler.ts:730          | Clear all timers                                                                                                    
`restartScheduler`            | fn    | src/main/scheduler.ts:737          | Restart on settings change                                                                                           
`scheduleEvents`              | fn    | src/main/scheduler.ts:372          | Per-event setTimeout timers (uses `alertTimers` map for alert window)                                                                                         
`poll`                        | fn    | src/main/scheduler.ts:681          | Calendar poll with error handling                                                                                   
| `buildMeetUrl`                | fn    | src/main/utils/meet-url.ts:7       | Appends `?authuser=email`                                                                                           |
| `isAllowedMeetUrl`            | fn    | src/main/utils/url-validation.ts   | Validates against MEET_URL_ALLOWLIST                                                                                |
| `MEET_URL_ALLOWLIST`          | const | src/main/utils/url-validation.ts:2 | Google domains for shell.openExternal                                                                               |
`getSettings`                | fn    | src/main/settings.ts:80            | Load settings (returns merged defaults)                                                                              
| `updateSettings`              | fn    | src/main/settings.ts:84            | Persist partial settings                                                                                            |
| `createSettingsWindow`        | fn    | src/main/settings-window.ts:15     | Singleton settings window                                                                                           |
| `getAutoLaunchStatus`         | fn    | src/main/auto-launch.ts:7          | Read macOS login item status                                                                                        |
| `setAutoLaunch`               | fn    | src/main/auto-launch.ts:21         | Set macOS login item                                                                                                |
| `syncAutoLaunch`              | fn    | src/main/auto-launch.ts:40         | Sync if state differs                                                                                               |
| `formatRemainingTime`         | fn    | src/main/tray.ts:212               | Format countdown for tray title                                                                                     |
| `updateTrayTitle`             | fn    | src/main/tray.ts:227               | Set tray title with countdown                                                                                       |
| `checkNotificationPermission` | fn    | src/main/notification.ts:26        | macOS notification permission prompt                                                                                |
| `getPackageInfo`              | fn    | src/main/utils/packageInfo.ts      | Read package.json at runtime                                                                                        |
| `IPC_CHANNELS`                | const | src/shared/types.ts:2              | 11 channel names                                                                                                    |
| `IpcChannelMap`               | type  | src/shared/types.ts:17             | Request/response type map                                                                                           |
| `MeetingEvent`                | iface | src/shared/types.ts:25             | Event data model                                                                                                    |
|| `AppSettings`                 | iface | `src/shared/types.ts:43`             | { schemaVersion, openBeforeMinutes, launchAtLogin, showTomorrowMeetings, windowAlert }                          
|| `DEFAULT_SETTINGS`            | const | `src/shared/types.ts:57`             | { schemaVersion: 1, openBeforeMinutes: 1, launchAtLogin: false, showTomorrowMeetings: true, windowAlert: true }
| `AppState`                    | type  | src/renderer/index.ts:5            | UI state union                                                                                                      |
| `api`                         | const | src/preload/index.ts:5             | Context bridge API                                                                                                  |

## CONVENTIONS

- **ESM source → CJS output**: Source `.ts` with ESM, outputs `.cjs` for Electron
- **Import paths**: Always `.js` extension (`from './types.js'`) even for `.ts` source
- **IPC channels**: Define in `src/shared/types.ts` → `IpcChannelMap` for type safety
- **Type-safe IPC**: Use `typedHandle()` in main, `IpcResponse<T>` in preload
- **No UI framework**: Vanilla TS with `innerHTML` string templates
- **macOS only**: Swift EventKit, dock hiding, entitlements — no cross-platform
- **Settings persistence**: JSON file in Electron userData directory; configurable open-before timing (1-5 min), launch at login toggle
- **Settings window**: Shows in Dock when open, hides when closed (tray-only otherwise)
- **Alert window**: Full-screen overlay, singleton, Escape to dismiss, `windowAlert` setting toggle; fires 1 min before browser open (alertDelay = openBeforeMinutes + 1 min before meeting)
- **No barrel files**: All imports use direct paths (e.g., `../shared/types.js`)
- **Renderer logging**: Raw `console.*` calls (no structured logger)
- **Main process logging**: `electron-log` for shortcuts and auto-updater; `console.*` for auto-launch/notification
- **Dev env var**: `VITE_DEV_SERVER_URL` (legacy name from Vite migration, functional)

## ANTI-PATTERNS (THIS PROJECT)

```typescript
// rslib.config.preload.ts — electron must never be bundled in preload
// rslib.config.ts — electron external appended AFTER ElectronTargetPlugin
```

- Electron module MUST be external in preload builds (handled in rspack config)
- Electron external MUST be appended AFTER `ElectronTargetPlugin` sets its own externals
- Never suppress type errors (`as any`, `@ts-ignore`, `@ts-expect-error`) — zero in source
- Never bypass `validateSender()` in IPC handlers
- Never use `fs.readFileSync()` for tray icons — `nativeImage.createFromPath()` required (understands ASAR paths)
- Never bundle the Swift source file inside ASAR — `swiftc` cannot read from ASAR archives
- Never open arbitrary URLs via `shell.openExternal()` — validate against `MEET_URL_ALLOWLIST`
- Never insert user content via `innerHTML` without `escapeHtml()` — XSS protection
- All BrowserWindows must have `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`

## COMMANDS

```bash
bun run dev          # Start dev (watch + electron)
bun run build        # Build all (main + preload + renderer)
bun run package      # Build + create DMG/ZIP (macOS arm64)
bun run package:dir  # Build + unpacked directory (no DMG)
bun run typecheck    # TypeScript check (tsc -b)
bun run test         # Run Vitest tests (main + renderer workspaces)
bun run test:watch   # Watch mode tests
bun run test:coverage # Tests with coverage report
bun run clean        # Remove lib/ dist/
rm -rf /tmp/googlemeet   # Force Swift binary recompile after .swift changes
```

## BUILD SYSTEM

Three-process build:

1. **Main** (`rslib.config.ts`): `electron-main` target → `lib/main/index.cjs`
2. **Preload** (`rslib.config.preload.ts`): `electron-preload` target → `lib/preload/index.cjs`
3. **Renderer** (`rsbuild.config.ts`): Three environments (`main` popover + `settings` + `alert`) → `lib/renderer/`

Production: SWC minifier with `drop_console: true`, tree-shaking, no source maps.
Dev orchestration: `scripts/dev.ts` spawns 3 processes (2x rslib watch + rsbuild dev), TCP health-checks build outputs, then launches Electron with `--disable-gpu-sandbox`.

## PACKAGING

- `electron-builder` for macOS arm64 only
- Hardened runtime disabled, Gatekeeper disabled (dev/unsigned build mode)
- Notarization via `build/notarize.cjs` afterSign hook (requires `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`)
- Entitlements in `build/entitlements.mac*.plist` (JIT, unsigned memory, calendar, Apple Events)
- Swift file unpacked from ASAR via `asarUnpack` in `electron-builder.yml`
- English only (`electronLanguages: [en]`)
- `LSUIElement: true` — tray-only, no Dock icon
- Standalone DMG build script: `build-macOS-dmg.sh` (handles Developer ID + ad-hoc signing)
- Auto-updater enabled via `electron-updater` in packaged builds (checks on startup, installs on quit)

## CI

Two GitHub Actions workflows in `.github/workflows/`:

- **`pr-check.yml`**: Runs on PR/push to `develop`/`main` — `bun install --frozen-lockfile`, `typecheck`, `test`, `test:coverage`
- **`release.yml`**: Runs on version tags (`v*`) — `build`, `package` (requires `GH_TOKEN`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`)

## NOTES

- **Calendar permission**: First access triggers macOS EventKit permission dialog
- **Swift binary cache**: Compiled to `/tmp/googlemeet/googlemeet-events` on first run; `rm -rf /tmp/googlemeet` to recompile after Swift changes
- **Auto-open**: Browser opens configurable 1-5 min before each non-all-day meeting; `?authuser=email` from event attendee data
- **Full-screen alert**: When `windowAlert` setting is true, shows full-screen overlay instead of just opening browser
- **Alert window timing**: `windowAlert` shows full-screen overlay at `openBeforeMinutes + 1` min before meeting. Browser auto-open suppressed when alert was already shown.
- **Global shortcut**: Cmd+Shift+M joins the next upcoming meeting with a URL
- **Launch at login**: Uses `app.setLoginItemSettings()` to enable/disable auto-start on macOS login
- **Scheduler polling**: Polls every 2 min (independent of renderer's 5-min UI refresh)
- **Window hide on blur**: Popover behavior — hides when focus lost (dev mode exempt)
- **Tests**: 121 tests covering scheduler, calendar, IPC, settings, auto-launch, tray, meet-url, notification, event delegation, and XSS protection

## TESTS

| Project  | Env   | Focus                                              |
| -------- | ----- | -------------------------------------------------- |
| main     | node  | Scheduler, calendar, IPC, settings, tray, meet-url |
| renderer | jsdom | Event delegation, XSS protection                   |

**Groups**: scheduler.test.ts uses A-F labeled groups (deletion, changes, race conditions, countdowns, errors, poll IPC)

**Setup**: `tests/setup.main.ts` mocks full Electron API

**Commands**: `bun run test` | `bun run test:watch` | `bun run test:coverage`
