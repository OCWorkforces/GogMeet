# GogMeet — Project Knowledge Base

**Generated:** 2026-03-11
**Commit:** 03cf128
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
| Test      | Vitest 4 (workspace, 1,127 lines tests)   |

## STRUCTURE

```
src/
├── main/             # Electron main process (Node.js)
│   ├── index.ts      # App bootstrap, window, lifecycle
│   ├── calendar.ts   # Swift EventKit calendar integration
│   ├── scheduler.ts  # Auto-launch browser 1 min before meetings
│   ├── tray.ts       # System tray icon + menu
│   ├── ipc.ts        # IPC handlers (calendar, window, app)
│   └── googlemeet-events.swift  # Native EventKit helper (compiled at runtime)
├── renderer/         # UI (web context, vanilla TS)
│   ├── index.ts      # Main UI logic, state machine
│   ├── index.html    # CSP-protected template
│   └── styles/       # CSS (dark mode native aesthetic)
├── preload/          # Context bridge (sandbox)
│   └── index.ts      # Exposes window.api to renderer
├── shared/           # Types shared across processes
│   └── types.ts      # IPC_CHANNELS, MeetingEvent, CalendarPermission
├── assets/           # Static (tray icons)
└── tests/            # Vitest tests (main/renderer workspaces)
    ├── setup.main.ts # Electron mock for main process
    ├── main/         # Scheduler, calendar, IPC tests (906 lines)
    └── renderer/     # Event delegation, XSS tests (159 lines)
```

## WHERE TO LOOK

| Task                  | Location                               | Notes                                                         |
| --------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Add IPC channel       | `src/shared/types.ts` → `IPC_CHANNELS` | Single source of truth                                        |
| Implement IPC handler | `src/main/ipc.ts`                      | Register with `ipcMain.handle()`                              |
| Expose to renderer    | `src/preload/index.ts`                 | Add to `api` object                                           |
| Use in UI             | `src/renderer/index.ts`                | Call via `window.api.*`                                       |
| Calendar logic        | `src/main/calendar.ts`                 | Swift EventKit via compiled binary                            |
| Auto-launch scheduler | `src/main/scheduler.ts`                | `startScheduler` / `stopScheduler`                            |
| Swift EventKit output | `src/main/googlemeet-events.swift`     | Tab-delimited: id\ttitle\tstart\tend\turl\tcal\tallDay\temail |
| UI state              | `src/renderer/index.ts`                | `AppState` type union                                         |
| Window config         | `src/main/index.ts`                    | `createWindow()`                                              |
| Tray behavior         | `src/main/tray.ts`                     | Menu, positioning                                             |
| Build config          | `rslib.config.ts`, `rsbuild.config.ts` | Separate for each process                                     |

## CODE MAP

| Symbol | Type | Location | Role |
| ------ | ---- | -------- | ---- |
| `createWindow` | fn | src/main/index.ts:38 | BrowserWindow factory |
| `setupTray` | fn | src/main/tray.ts:29 | System tray init |
| `registerIpcHandlers` | fn | src/main/ipc.ts:68 | IPC registration |
| `typedHandle` | fn | src/main/ipc.ts:58 | Type-safe IPC wrapper |
| `validateSender` | fn | src/main/ipc.ts:32 | Origin validation |
| `getCalendarEventsResult` | fn | src/main/calendar.ts:144 | Swift EventKit fetch |
| `parseEvents` | fn | src/main/calendar.ts:91 | Parses tab-delimited Swift output |
| `startScheduler` | fn | src/main/scheduler.ts:496 | Start poll loop |
| `stopScheduler` | fn | src/main/scheduler.ts:508 | Clear all timers |
| `scheduleEvents` | fn | src/main/scheduler.ts:219 | Per-event setTimeout timers |
| `poll` | fn | src/main/scheduler.ts:463 | Calendar poll with error handling |
| `buildMeetUrl` | fn | src/main/utils/meet-url.ts:7 | Appends `?authuser=email` |
| `IPC_CHANNELS` | const | src/shared/types.ts:2 | Channel names |
| `IpcChannelMap` | type | src/shared/types.ts:12 | Request/response type map |
| `MeetingEvent` | iface | src/shared/types.ts:45 | Event data model |
| `AppState` | type | src/renderer/index.ts:4 | UI state union |
| `api` | const | src/preload/index.ts:5 | Context bridge API |

## CONVENTIONS

- **ESM source → CJS output**: Source `.ts` with ESM, outputs `.cjs` for Electron
- **Import paths**: Always `.js` extension (`from './types.js'`) even for `.ts` source
- **IPC channels**: Define in `src/shared/types.ts` → `IpcChannelMap` for type safety
- **Type-safe IPC**: Use `typedHandle()` in main, `IpcResponse<T>` in preload
- **No UI framework**: Vanilla TS with `innerHTML` string templates
- **macOS only**: Swift EventKit, dock hiding, entitlements — no cross-platform
- **Tray-only**: `LSUIElement: true` — no Dock icon
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
- **Scheduler polling**: Polls every 2 min (independent of renderer's 5-min UI refresh)
- **Window hide on blur**: Popover behavior — hides when focus lost (dev mode exempt)
- **Tests exist**: 1,127 lines covering scheduler, calendar, IPC, event delegation, and XSS protection
- **No CI**: No GitHub workflows or other CI configured

## TESTS

| Project  | Env   | Location                   | Focus                              |
| -------- | ----- | -------------------------- | ---------------------------------- |
| main     | node  | `tests/main/*.test.ts`     | Scheduler, calendar, IPC, security |
| renderer | jsdom | `tests/renderer/*.test.ts` | Event delegation, XSS protection   |

**Setup**: `tests/setup.main.ts` mocks full Electron API (app, BrowserWindow, ipcMain, Tray, etc.)

**Test Commands**: `bun run test` (run once) | `bun run test:watch` (watch mode)
