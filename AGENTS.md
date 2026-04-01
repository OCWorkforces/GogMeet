# GogMeet — Project Knowledge Base

**Generated:** 2026-04-01
**Commit:** 3e6a1ab
**Branch:** develop

## OVERVIEW

macOS tray-only Electron app for Google Meet calendar reminders. Fetches events via Swift EventKit from macOS Calendar, auto-opens meetings in browser 1 min before start, displays upcoming meetings in a native popover UI. Supports full-screen meeting alerts (1 min before browser open) and auto-updates.

| Layer     | Tech                                      |
| --------- | ----------------------------------------- |
| Runtime   | Bun 1.3.11+ / Node.js 20.0.0+            |
| Framework | Electron 41                               |
| Build     | Rslib (main/preload) + Rsbuild (renderer) |
| Package   | Bun                                       |
| Test      | Vitest 4 (workspace)                      |

## STRUCTURE

```
src/
├── main/             # Electron main process (Node.js)
│   ├── index.ts      # App bootstrap, BrowserWindow factory
│   ├── lifecycle.ts  # Subsystem init/shutdown orchestration
│   ├── calendar.ts   # Swift EventKit calendar integration
│   ├── ipc.ts        # IPC handler registration (delegates to ipc-handlers/)
│   ├── tray.ts       # System tray icon + menu
│   ├── settings.ts   # Persistent app settings (JSON in userData)
│   ├── auto-launch.ts # macOS login items (launch at login)
│   ├── settings-window.ts # Settings BrowserWindow singleton
│   ├── alert-window.ts   # Full-screen meeting alert BrowserWindow
│   ├── shortcuts.ts      # Global keyboard shortcut (Cmd+Shift+M)
│   ├── auto-updater.ts   # Electron auto-updater (packaged builds)
│   ├── notification.ts   # Notification permission check
│   ├── power.ts         # Power management (battery-aware polling, sleep prevention)
│   ├── googlemeet-events.swift  # Native EventKit helper (compiled at runtime)
│   ├── scheduler/     # Auto-launch browser before meetings
│   │   ├── index.ts   # Core scheduling engine, timer orchestration
│   │   ├── state.ts   # Scheduler state (Proxy views over Maps/Sets)
│   │   └── countdown.ts # Tray title resolution, in-meeting countdown
│   ├── ipc-handlers/  # IPC handler implementations
│   │   ├── shared.ts  # typedHandle(), validateSender(), ALLOWED_ORIGINS
│   │   ├── calendar.ts # 3 calendar channels
│   │   ├── settings.ts # 2 settings channels + push
│   │   ├── app.ts     # open-external, get-version
│   │   └── window.ts  # set-height (fire-and-forget)
│   └── utils/         # Main process utilities
│       ├── browser-window.ts # SECURE_WEB_PREFERENCES, getPreloadPath, loadWindowContent
│       ├── meet-url.ts       # buildMeetUrl with ?authuser=email
│       ├── url-validation.ts # MEET_URL_ALLOWLIST for shell.openExternal
│       └── packageInfo.ts    # Read package.json at runtime
├── renderer/         # UI (web context, vanilla TS)
│   ├── index.ts      # Main popover UI, state machine
│   ├── index.html    # CSP-protected template
│   ├── settings/     # Settings window (separate entry)
│   │   ├── index.ts  # Settings form logic, save indicator
│   │   ├── index.html
│   │   └── styles.css # iOS-style toggles
│   ├── alert/        # Full-screen meeting alert (separate entry)
│   │   ├── index.ts  # Alert overlay logic (Escape dismisses)
│   │   ├── index.html
│   │   └── styles.css # Dark full-screen styles
│   └── styles/       # CSS (shared reset + native macOS aesthetic)
│       ├── reset.css # CSS variables, dark mode, font stack
│       └── main.css  # Popover-specific styles
├── preload/          # Context bridge (sandbox)
│   └── index.ts      # Exposes window.api to renderer
├── shared/           # Types shared across processes
│   ├── ipc-channels.ts # IPC_CHANNELS, IpcChannelMap, type utilities
│   ├── models.ts       # MeetingEvent, CalendarResult, CalendarPermission
│   ├── settings.ts     # AppSettings, DEFAULT_SETTINGS, min/max constants
│   └── utils/          # Cross-process utilities
│       └── escape-html.ts # XSS protection
└── tests/            # Vitest tests (main/renderer workspaces)
    ├── setup.main.ts # Electron mock for main process
    ├── main/         # 27 test files
    │   └── renderer/     # 5 test files
```

## WHERE TO LOOK

| Task                  | Location                               | Notes                                                         |
| --------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Add IPC channel       | `src/shared/ipc-channels.ts` → `IPC_CHANNELS` | Single source of truth                                        |
| Implement IPC handler | `src/main/ipc-handlers/`               | Add file, register with `typedHandle()`                       |
| Expose to renderer    | `src/preload/index.ts`                 | Add to `api` object                                           |
| Use in UI             | `src/renderer/index.ts`                | Call via `window.api.*`                                       |
| Calendar logic        | `src/main/calendar.ts`                 | Swift EventKit via compiled binary                            |
| Auto-launch scheduler | `src/main/scheduler/index.ts`          | `startScheduler` / `stopScheduler` / `restartScheduler`       |
| Scheduler state       | `src/main/scheduler/state.ts`          | Proxy views over Maps/Sets, state primitives                  |
| Countdown logic       | `src/main/scheduler/countdown.ts`      | Tray title resolution, in-meeting countdown                   |
| Launch at login       | `src/main/auto-launch.ts`              | `getAutoLaunchStatus` / `setAutoLaunch` / `syncAutoLaunch`    |
| Swift EventKit output | `src/main/googlemeet-events.swift`     | Tab-delimited: id\ttitle\tstart\tend\turl\tcal\tallDay\temail\tnotes |
| User settings         | `src/main/settings.ts`                 | JSON in userData, clamped to min/max                          |
| Settings window       | `src/main/settings-window.ts`          | Singleton BrowserWindow, shows in Dock                        |
| Alert window          | `src/main/alert-window.ts`             | Full-screen overlay, singleton, dismissed by Escape           |
| Global shortcut       | `src/main/shortcuts.ts`                | Cmd+Shift+M → join next meeting                               |
| Auto-updater          | `src/main/auto-updater.ts`             | electron-updater, packaged builds only                        |
| App lifecycle         | `src/main/lifecycle.ts`                | `initializeApp()` / `shutdownApp()`                           |
| Window config         | `src/main/utils/browser-window.ts`     | `SECURE_WEB_PREFERENCES`, `getPreloadPath`, `loadWindowContent` |
| UI state              | `src/renderer/index.ts`                | `AppState` type union                                         |
| Tray behavior         | `src/main/tray.ts`                     | Menu, positioning                                             |
| URL validation        | `src/main/utils/url-validation.ts`     | `MEET_URL_ALLOWLIST` for `shell.openExternal`                 |
| Power management       | `src/main/power.ts`                    | Battery-aware polling, ref-counted sleep prevention            |
| Build config          | `rslib.config.ts`, `rsbuild.config.ts` | Separate for each process                                     |

## CODE MAP

| Symbol                        | Type  | Location                           | Role                                                                                                                |
| ----------------------------- | ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `createWindow`                | fn    | src/main/index.ts:42               | BrowserWindow factory                                                                                               |
| `initializeApp`              | fn    | src/main/lifecycle.ts:20           | Subsystem init (IPC, tray, scheduler, shortcuts, auto-launch)                                                       |
| `shutdownApp`                | fn    | src/main/lifecycle.ts:40           | Stop scheduler on quit                                                                                              |
| `setupTray`                  | fn    | src/main/tray.ts:60                | System tray init                                                                                                    |
| `showAlert`                  | fn    | src/main/alert-window.ts:11        | Full-screen alert BrowserWindow                                                                                     |
| `registerShortcuts`          | fn    | src/main/shortcuts.ts:8            | Global shortcut Cmd+Shift+M                                                                                         |
| `initAutoUpdater`            | fn    | src/main/auto-updater.ts:10        | electron-updater setup (packaged only)                                                                              |
| `registerIpcHandlers`        | fn    | src/main/ipc.ts:11                 | IPC registration (delegates to ipc-handlers/)                                                                       |
| `typedHandle`                | fn    | src/main/ipc-handlers/shared.ts:42 | Type-safe IPC wrapper                                                                                               |
| `validateSender`             | fn    | src/main/ipc-handlers/shared.ts:15 | Origin validation against ALLOWED_ORIGINS                                                                           |
| `getCalendarEventsResult`    | fn    | src/main/calendar.ts:247           | Swift EventKit fetch                                                                                                |
| `parseEvents`                | fn    | src/main/calendar.ts:172           | Parses 9-field tab-delimited Swift output                                                                           |
| `requestCalendarPermission`  | fn    | src/main/calendar.ts:269           | macOS EventKit permission prompt                                                                                    |
| `getCalendarPermissionStatus`| fn    | src/main/calendar.ts:283           | Read current calendar permission                                                                                    |
| `startScheduler`             | fn    | src/main/scheduler/index.ts:466    | Start poll loop                                                                                                     |
| `stopScheduler`              | fn    | src/main/scheduler/index.ts:478    | Clear all timers                                                                                                    |
| `restartScheduler`           | fn    | src/main/scheduler/index.ts:485    | Restart on settings change                                                                                          |
| `scheduleEvents`             | fn    | src/main/scheduler/index.ts:80     | Per-event setTimeout timers (8 timer types)                                                                         |
| `poll`                       | fn    | src/main/scheduler/index.ts:429    | Calendar poll with error handling                                                                                   |
| `buildMeetUrl`               | fn    | src/main/utils/meet-url.ts:9       | Appends `?authuser=email`                                                                                           |
| `isAllowedMeetUrl`           | fn    | src/main/utils/url-validation.ts:9 | Validates against MEET_URL_ALLOWLIST                                                                                |
| `MEET_URL_ALLOWLIST`         | const | src/main/utils/url-validation.ts:2 | Google domains for shell.openExternal                                                                               |
| `SECURE_WEB_PREFERENCES`     | const | src/main/utils/browser-window.ts   | sandbox + contextIsolation + no nodeIntegration                                                                     |
| `getPreloadPath`             | fn    | src/main/utils/browser-window.ts   | Preload script path for BrowserWindow                                                                               |
| `loadWindowContent`          | fn    | src/main/utils/browser-window.ts   | Dev/prod HTML loader                                                                                                |
| `getSettings`                | fn    | src/main/settings.ts:89            | Load settings (returns merged defaults)                                                                             |
| `updateSettings`             | fn    | src/main/settings.ts:93            | Persist partial settings                                                                                           |
| `createSettingsWindow`       | fn    | src/main/settings-window.ts:15     | Singleton settings window                                                                                           |
| `getAutoLaunchStatus`        | fn    | src/main/auto-launch.ts:7          | Read macOS login item status                                                                                        |
| `setAutoLaunch`              | fn    | src/main/auto-launch.ts:21         | Set macOS login item                                                                                                |
| `syncAutoLaunch`             | fn    | src/main/auto-launch.ts:40         | Sync if state differs                                                                                               |
| `formatRemainingTime`        | fn    | src/main/tray.ts:216               | Format countdown for tray title                                                                                     |
| `updateTrayTitle`            | fn    | src/main/tray.ts:231               | Set tray title with countdown                                                                                       |
| `checkNotificationPermission`| fn    | src/main/notification.ts:26        | macOS notification permission prompt                                                                                |
| `initPowerManagement`   | fn    | src/main/power.ts:13             | Register battery/AC change listeners                             |
| `cleanupPowerManagement`| fn    | src/main/power.ts:18             | Remove power listeners                                            |
| `preventSleep`          | fn    | src/main/power.ts:26             | Ref-counted display-sleep blocker                                 |
| `allowSleep`            | fn    | src/main/power.ts:33             | Release display-sleep blocker                                     |
| `isSleepPrevented`      | fn    | src/main/power.ts:42             | Check if sleep blocker active                                     |
| `getPackageInfo`             | fn    | src/main/utils/packageInfo.ts      | Read package.json at runtime, returns frozen object                                                                 |
| `IPC_CHANNELS`               | const | src/shared/ipc-channels.ts:5       | 11 channel names                                                                                                    |
| `IpcChannelMap`              | type  | src/shared/ipc-channels.ts:24      | Request/response type map                                                                                           |
| `MeetingEvent`               | iface | src/shared/models.ts:2             | Event data model                                                                                                    |
| `AppSettings`                | iface | src/shared/settings.ts:3           | { schemaVersion, openBeforeMinutes, launchAtLogin, showTomorrowMeetings, windowAlert }
| `DEFAULT_SETTINGS`           | const | src/shared/settings.ts:17          | { schemaVersion: 1, openBeforeMinutes: 1, launchAtLogin: false, showTomorrowMeetings: true, windowAlert: true }
| `AppState`                   | type  | src/renderer/index.ts:6            | UI state union (loading | no-permission | no-events | has-events | error)                                           |
| `api`                        | const | src/preload/index.ts:6             | Context bridge API (calendar, window, app, settings, alert)                                                         |

## CONVENTIONS

- **ESM source → CJS output**: Source `.ts` with ESM, outputs `.cjs` for Electron
- **Import paths**: Always `.js` extension (`from './types.js'`) even for `.ts` source
- **Import types separately**: `import type { X }` enforced by `verbatimModuleSyntax`
- **IPC channels**: Define in `src/shared/ipc-channels.ts` → `IpcChannelMap` for type safety
- **Type-safe IPC**: Use `typedHandle()` in ipc-handlers/, `IpcResponse<T>` in preload
- **IPC handler registration**: Each domain has its own file in `ipc-handlers/`, exports `register*Handlers()`
- **No UI framework**: Vanilla TS with `innerHTML` string templates
- **macOS only**: Swift EventKit, dock hiding, entitlements — no cross-platform
- **Settings persistence**: JSON file in Electron userData directory; configurable open-before timing (1-5 min), launch at login toggle
- **Settings window**: Shows in Dock when open, hides when closed (tray-only otherwise)
- **Alert window**: Full-screen overlay, singleton, Escape to dismiss, `windowAlert` setting toggle; fires 1 min before browser open (alertDelay = openBeforeMinutes + 1 min before meeting)
- **No barrel files**: All imports use direct paths (e.g., `../shared/ipc-channels.js`)
- **Renderer logging**: Raw `console.*` calls (no structured logger)
- **Main process logging**: `electron-log` for shortcuts and auto-updater; `console.*` for auto-launch/notification
- **Dev env var**: `VITE_DEV_SERVER_URL` (legacy name from Vite migration, functional)
- **Alert animations**: Fade+zoom in/out via CSS keyframes; `dismissAlert()` in alert renderer handles animation-then-close
- **CSS reset**: `renderer/styles/reset.css` defines CSS variables, imported by all 3 renderer entries
- **Lifecycle**: `lifecycle.ts` orchestrates all subsystem init (`initializeApp`) and shutdown (`shutdownApp`)
- **TypeScript strict**: `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noImplicitOverride`, `noUncheckedIndexedAccess`, `noEmitOnError`

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

- `electron-builder` for macOS arm64 + x64 (separate builds, no universal)
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
- **`release.yml`**: Runs on push to `main` (creates version tag) + `v*` tags — `build`, `package` (requires `GH_TOKEN`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`)

## NOTES

- **Calendar permission**: First access triggers macOS EventKit permission dialog
- **Swift binary cache**: Compiled to `/tmp/googlemeet/googlemeet-events` on first run; hash-based recompilation; `rm -rf /tmp/googlemeet` to force recompile
- **Swift output format**: 9 tab-delimited fields: uid\ttitle\tstartISO\tendISO\turl\tcalName\tallDay\tuserEmail\tnotes
- **Auto-open**: Browser opens configurable 1-5 min before each non-all-day meeting; `?authuser=email` from event attendee data
- **Full-screen alert**: When `windowAlert` setting is true, shows full-screen overlay instead of just opening browser
- **Alert window timing**: `windowAlert` shows full-screen overlay at `openBeforeMinutes + 1` min before meeting. Browser auto-open suppressed when alert was already shown.
- **Global shortcut**: Cmd+Shift+M joins the next upcoming meeting with a URL
- **Launch at login**: Uses `app.setLoginItemSettings()` to enable/disable auto-start on macOS login
- **Scheduler polling**: Polls every 2 min (independent of renderer's 5-min UI refresh)
- **Scheduler state**: Proxy views over Maps/Sets in `scheduler/state.ts` — 8 timer maps, 2 fired-event sets, 3 scalars
- **Window hide on blur**: Popover behavior — hides when focus lost (dev mode exempt)
- **Tests**: 125+ tests across 32 test files covering scheduler, calendar, IPC, settings, auto-launch, tray, meet-url, notification, power, event delegation, and XSS protection

## TESTS

| Project  | Env   | Focus                                              |
| -------- | ----- | -------------------------------------------------- |
| main     | node  | Scheduler, calendar, IPC, settings, tray, meet-url |
| renderer | jsdom | Event delegation, XSS protection                   |

**Groups**: scheduler.test.ts uses A-F labeled groups (deletion, changes, race conditions, countdowns, errors, poll IPC)

**Setup**: `tests/setup.main.ts` mocks full Electron API

**Commands**: `bun run test` | `bun run test:watch` | `bun run test:coverage`
