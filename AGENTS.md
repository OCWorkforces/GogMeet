# GoogleMeet — Project Knowledge Base

**Generated:** 2026-03-07
**Commit:** fd142e4
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
| Test      | Vitest 4 (workspace, 522 lines tests)     |

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
    ├── main/         # Scheduler tests (445 lines)
    └── renderer/     # Event delegation tests (77 lines)
```

## WHERE TO LOOK

| Task                      | Location                               | Notes                                                              |
| ------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Add IPC channel           | `src/shared/types.ts` → `IPC_CHANNELS` | Single source of truth                                             |
| Implement IPC handler     | `src/main/ipc.ts`                      | Register with `ipcMain.handle()`                                   |
| Expose to renderer        | `src/preload/index.ts`                 | Add to `api` object                                                |
| Use in UI                 | `src/renderer/index.ts`                | Call via `window.api.*`                                            |
| Calendar logic            | `src/main/calendar.ts`                 | Swift EventKit via compiled binary                                 |
| Auto-launch scheduler     | `src/main/scheduler.ts`                | `startScheduler` / `stopScheduler`                                 |
| Swift EventKit output     | `src/main/googlemeet-events.swift`         | Format: `id\|\|title\|\|start\|\|end\|\|url\|\|cal\|\|allDay\|\|email` |
| UI state                  | `src/renderer/index.ts`                | `AppState` type union                                              |
| Window config             | `src/main/index.ts`                    | `createWindow()`                                                   |
| Tray behavior             | `src/main/tray.ts`                     | Menu, positioning                                                  |
| Build config              | `rslib.config.ts`, `rsbuild.config.ts` | Separate for each process                                          |

## CODE MAP

| Symbol                | Type  | Location                  | Role                                      |
| --------------------- | ----- | ------------------------- | ----------------------------------------- |
| `createWindow`        | fn    | src/main/index.ts:14      | BrowserWindow factory                     |
| `setupTray`           | fn    | src/main/tray.ts:18       | System tray init                          |
| `registerIpcHandlers` | fn    | src/main/ipc.ts:5         | IPC registration                          |
| `getCalendarEvents`   | fn    | src/main/calendar.ts:125  | Swift EventKit fetch                      |
| `parseEvents`         | fn    | src/main/calendar.ts:72   | Parses pipe-delimited Swift output        |
| `stopScheduler`       | fn    | src/main/scheduler.ts:117 | Clears all timers on quit                 |
| `buildMeetUrl`        | fn    | src/main/scheduler.ts:56  | Appends `?authuser=email` to Meet URL     |
| `scheduleEvents`      | fn    | src/main/scheduler.ts:102 | Set/clear per-event setTimeout timers     |
| `IPC_CHANNELS`        | const | src/shared/types.ts:2     | Channel names                             |
| `MeetingEvent`        | iface | src/shared/types.ts:15    | Event data model (incl. `userEmail`)      |
| `AppState`            | type  | src/renderer/index.ts:4   | UI state union                            |
| `api`                 | const | src/preload/index.ts:5    | Context bridge API                        |

## CONVENTIONS

- **ESM source → CJS output**: Source is `.ts` with ESM, outputs `.cjs` for Electron
- **IPC channels**: Define in `src/shared/types.ts` first, use in all 3 processes
- **No UI framework**: Renderer uses vanilla TS with `innerHTML` string templates
- **macOS only**: Swift EventKit, dock hiding, entitlements — no cross-platform
- **Tray-only**: `LSUIElement: true` — no Dock icon

## ANTI-PATTERNS (THIS PROJECT)

```
// rslib.config.preload.ts:22
// electron must never be bundled in preload
```

Electron module must be external in preload builds. Already handled in rspack config.

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
- **Tests exist**: 522 lines covering scheduler state machine and event delegation
- **No CI**: No GitHub workflows or other CI configured

## TESTS

| Project   | Env    | Location                    | Focus                           |
| --------- | ------ | --------------------------- | ------------------------------- |
| main      | node   | `tests/main/*.test.ts`      | Scheduler, tray, timer logic    |
| renderer  | jsdom  | `tests/renderer/*.test.ts`  | Event delegation, DOM behavior  |

**Setup**: `tests/setup.main.ts` mocks full Electron API (app, BrowserWindow, ipcMain, Tray, etc.)

**Test Commands**: `bun run test` (run once) | `bun run test:watch` (watch mode)
