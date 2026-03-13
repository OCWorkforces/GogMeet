# GogMeet — Project Knowledge Base

**Generated:** 2026-03-13
**Commit:** 3f9879c
**Branch:** develop

## OVERVIEW

macOS tray-only Electron app for Google Meet calendar reminders. Fetches events via Swift EventKit from macOS Calendar, auto-opens meetings in browser 1 min before start, displays upcoming meetings in a native popover UI.

| Layer     | Tech                                      |
| --------- | ----------------------------------------- |
| Runtime   | Bun 1.3.10+ / Node.js 24.14.0+            |
| Framework | Electron 40                               |
| Language  | TypeScript 5.9 (strict)                   |
| Build     | Rslib (main/preload) + Rsbuild (renderer) |
| Package   | Bun                                       |
| Test      | Vitest 4 (workspace, 104 tests)           |

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
│   ├── logger.ts     # Structured logging utility
│   └── googlemeet-events.swift  # Native EventKit helper (compiled at runtime)
├── renderer/         # UI (web context, vanilla TS)
│   ├── index.ts      # Main UI logic, state machine
│   ├── index.html    # CSP-protected template
│   ├── settings/     # Settings window (separate entry)
│   │   ├── index.ts  # Settings form logic
│   │   └── styles.css # Settings-specific styles (iOS-style toggles)
│   └── styles/       # CSS (dark mode native aesthetic)
├── preload/          # Context bridge (sandbox)
│   └── index.ts      # Exposes window.api to renderer
├── shared/           # Types shared across processes
│   ├── types.ts      # IPC_CHANNELS, MeetingEvent, AppSettings
│   └── utils/        # Cross-process utilities
│       └── escape-html.ts # XSS protection
└── tests/            # Vitest tests (main/renderer workspaces)
    ├── setup.main.ts # Electron mock for main process
    ├── main/         # Scheduler, calendar, IPC, settings, auto-launch tests
    └── renderer/     # Event delegation, XSS tests
```

## WHERE TO LOOK

| Task                  | Location                               | Notes                                                         |
| --------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Add IPC channel       | `src/shared/types.ts` → `IPC_CHANNELS` | Single source of truth                                        |
| Implement IPC handler | `src/main/ipc.ts`                      | Register with `ipcMain.handle()`                              |
| Expose to renderer    | `src/preload/index.ts`                 | Add to `api` object                                           |
| Use in UI             | `src/renderer/index.ts`                | Call via `window.api.*`                                       |
| Calendar logic        | `src/main/calendar.ts`                 | Swift EventKit via compiled binary                            |
| Auto-launch scheduler | `src/main/scheduler.ts`                | `startScheduler` / `stopScheduler` / `restartScheduler`       |
| Launch at login       | `src/main/auto-launch.ts`              | `getAutoLaunchStatus` / `setAutoLaunch` / `syncAutoLaunch`    |
| Swift EventKit output | `src/main/googlemeet-events.swift`     | Tab-delimited: id\ttitle\tstart\tend\turl\tcal\tallDay\temail |
| User settings         | `src/main/settings.ts`                 | JSON in userData, clamped to min/max                          |
| Settings window       | `src/main/settings-window.ts`          | Singleton BrowserWindow, shows in Dock                        |
| UI state              | `src/renderer/index.ts`                | `AppState` type union                                         |
| Window config         | `src/main/index.ts`                    | `createWindow()`                                              |
| Tray behavior         | `src/main/tray.ts`                     | Menu, positioning                                             |
| Build config          | `rslib.config.ts`, `rsbuild.config.ts` | Separate for each process                                     |

## CODE MAP

| Symbol | Type | Location | Role |
| ------ | ---- | -------- | ---- |
| `createWindow` | fn | src/main/index.ts:42 | BrowserWindow factory |
| `setupTray` | fn | src/main/tray.ts:29 | System tray init |
| `registerIpcHandlers` | fn | src/main/ipc.ts:72 | IPC registration |
| `typedHandle` | fn | src/main/ipc.ts:62 | Type-safe IPC wrapper |
| `validateSender` | fn | src/main/ipc.ts:36 | Origin validation |
| `getCalendarEventsResult` | fn | src/main/calendar.ts:144 | Swift EventKit fetch |
| `parseEvents` | fn | src/main/calendar.ts:91 | Parses tab-delimited Swift output |
| `startScheduler` | fn | src/main/scheduler.ts:500 | Start poll loop |
| `stopScheduler` | fn | src/main/scheduler.ts:512 | Clear all timers |
| `restartScheduler` | fn | src/main/scheduler.ts:545 | Restart on settings change |
| `scheduleEvents` | fn | src/main/scheduler.ts:223 | Per-event setTimeout timers |
| `poll` | fn | src/main/scheduler.ts:467 | Calendar poll with error handling |
| `buildMeetUrl` | fn | src/main/utils/meet-url.ts:7 | Appends `?authuser=email` |
| `loadSettings` | fn | src/main/settings.ts:32 | Load from userData/settings.json |
| `updateSettings` | fn | src/main/settings.ts:72 | Persist partial settings |
| `createSettingsWindow` | fn | src/main/settings-window.ts:15 | Singleton settings window |
| `getAutoLaunchStatus` | fn | src/main/auto-launch.ts:7 | Read macOS login item status |
| `setAutoLaunch` | fn | src/main/auto-launch.ts:14 | Set macOS login item |
| `syncAutoLaunch` | fn | src/main/auto-launch.ts:26 | Sync if state differs |
| `IPC_CHANNELS` | const | src/shared/types.ts:2 | 8 channel names |
| `IpcChannelMap` | type | src/shared/types.ts:14 | Request/response type map |
| `MeetingEvent` | iface | src/shared/types.ts:55 | Event data model |
| `AppSettings` | iface | src/shared/types.ts:73 | { openBeforeMinutes, launchAtLogin } |
| `DEFAULT_SETTINGS` | const | src/shared/types.ts:81 | { openBeforeMinutes: 1, launchAtLogin: false } |
| `AppState` | type | src/renderer/index.ts:4 | UI state union |
| `api` | const | src/preload/index.ts:5 | Context bridge API |

## CONVENTIONS

- **ESM source → CJS output**: Source `.ts` with ESM, outputs `.cjs` for Electron
- **Import paths**: Always `.js` extension (`from './types.js'`) even for `.ts` source
- **IPC channels**: Define in `src/shared/types.ts` → `IpcChannelMap` for type safety
- **Type-safe IPC**: Use `typedHandle()` in main, `IpcResponse<T>` in preload
- **No UI framework**: Vanilla TS with `innerHTML` string templates
- **macOS only**: Swift EventKit, dock hiding, entitlements — no cross-platform
- **Settings persistence**: JSON file in Electron userData directory; configurable open-before timing (1-5 min), launch at login toggle
- **Settings window**: Shows in Dock when open, hides when closed (tray-only otherwise)

## ANTI-PATTERNS (THIS PROJECT)

```
// rslib.config.preload.ts:22
// electron must never be bundled in preload
```

- Electron module MUST be external in preload builds (handled in rspack config)
- Never suppress type errors (`as any`, `@ts-ignore`)
- Never bypass `validateSender()` in IPC handlers

## COMMANDS

```bash
bun run dev          # Start dev (watch + electron)
bun run build        # Build all (main + preload + renderer)
bun run package      # Build + create DMG/ZIP (macOS arm64)
bun run typecheck    # TypeScript check
bun run test         # Run Vitest tests (main + renderer workspaces)
bun run clean        # Remove lib/ dist/
rm -rf /tmp/googlemeet   # Force Swift binary recompile after .swift changes
```

## BUILD SYSTEM

Three-process build:

1. **Main** (`rslib.config.ts`): `electron-main` target → `lib/main/index.cjs`
2. **Preload** (`rslib.config.preload.ts`): `electron-preload` target → `lib/preload/index.cjs`
3. **Renderer** (`rsbuild.config.ts`): `electron-renderer` target → `lib/renderer/`

Dev orchestration: `scripts/dev.ts` spawns 3 processes (2x rslib watch + rsbuild dev), then Electron.

## PACKAGING

- `electron-builder` for macOS arm64 only
- Hardened runtime, Gatekeeper disabled
- Notarization via `build/notarize.js` (requires `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`)
- Entitlements in `build/entitlements.mac*.plist`

## NOTES

- **Calendar permission**: First access triggers macOS EventKit permission dialog
- **Swift binary cache**: Compiled to `/tmp/googlemeet/googlemeet-events` on first run; `rm -rf /tmp/googlemeet` to recompile after Swift changes
- **Auto-open**: Browser opens 1 min before each non-all-day meeting; `?authuser=email` from event attendee data
- **Launch at login**: Uses `app.setLoginItemSettings()` to enable/disable auto-start on macOS login
- **Scheduler polling**: Polls every 2 min (independent of renderer's 5-min UI refresh)
- **Window hide on blur**: Popover behavior — hides when focus lost (dev mode exempt)
- **Tests exist**: 104 tests covering scheduler, calendar, IPC, settings, auto-launch, tray, event delegation, and XSS protection
- **No CI**: No GitHub workflows configured

## TESTS

| Project  | Env   | Focus                                        |
| -------- | ----- | -------------------------------------------- |
| main     | node  | Scheduler, calendar, IPC, settings, auto-launch |
| renderer | jsdom | Event delegation, XSS protection             |

**Groups**: scheduler.test.ts uses A-E labeled groups (deletion, changes, race conditions, countdowns, errors)

**Setup**: `tests/setup.main.ts` mocks full Electron API

**Commands**: `bun run test` | `bun run test:watch`
