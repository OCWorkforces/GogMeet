# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## STRUCTURE

```
tests/
├── main/
│   ├── scheduler.test.ts  # 537 lines — scheduler state machine (26 tests)
│   ├── calendar.test.ts   # 360 lines — Swift output parsing (16 tests)
│   ├── meet-url.test.ts   # 140 lines — URL building + allowlist (17 tests)
│   ├── ipc.test.ts        # 102 lines — security validation (15 tests)
│   ├── settings.test.ts   # 204 lines — file I/O, clamping, launchAtLogin (11 tests)
│   ├── tray.test.ts       # 189 lines — tray module (9 tests)
│   └── .gitkeep
└── renderer/
    ├── delegation.test.ts # 77 lines — event delegation (4 tests)
    ├── escape-html.test.ts # 71 lines — XSS protection (11 tests)
    └── .gitkeep
```

## CONFIGURATION

```typescript
// vitest.workspace.ts
projects: [
  {
    name: "main",
    environment: "node",
    include: ["tests/main/**/*.test.ts"],
    setupFiles: ["./tests/setup.main.ts"],
  },
  {
    name: "renderer",
    environment: "jsdom",
    include: ["tests/renderer/**/*.test.ts"],
  },
];
```

## MAIN PROCESS TESTS (98 tests total)

**Mock Pattern**:

```typescript
vi.mock("electron", () => ({ shell, Notification, ... }));
vi.mock("../../src/main/calendar.js", () => ({ getCalendarEventsResult: vi.fn() }));
vi.mock("../../src/main/tray.js", () => ({ updateTrayTitle: vi.fn() }));
```

| File              | Lines | Tests | Focus                                  |
| ----------------- | ----- | ----- | -------------------------------------- |
| scheduler.test.ts | 537   | 26    | State machine, race conditions, timers |
| meet-url.test.ts  | 140   | 17    | URL building with authuser + allowlist |
| calendar.test.ts  | 360   | 16    | parseEvents, dedup, date filtering     |
| ipc.test.ts       | 102   | 15    | validateSender, isAllowedMeetUrl       |
| settings.test.ts  | 204   | 11    | File I/O, clamping, defaults, launchAtLogin |
| tray.test.ts      | 189   | 9     | Tray title, time formatting            |

**Scheduler Test Groups** (A-E labeled):

| Group   | Focus                     |
| ------- | ------------------------- |
| A1-A7   | Event deletion/reschedule |
| B8-B9   | Title/URL changes         |
| C10-C13 | Race conditions           |
| D14-D15 | Concurrent countdowns     |
| E16-E18 | Error handling            |
| F1-F5   | Poll IPC notification      |

- `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for timer testing
- All state maps cleared in `beforeEach`: `timers`, `firedEvents`, `scheduledEventData`, `countdownIntervals`, `consecutiveErrors`
- `updateTrayTitle` mock for tray behavior assertions
- `vi.resetModules()` + dynamic import for fresh module state

## RENDERER TESTS (15 tests total)

| File                | Lines | Tests | Focus                    |
| ------------------- | ----- | ----- | ------------------------ |
| delegation.test.ts  | 77    | 4     | Event delegation on #app |
| escape-html.test.ts | 71    | 11    | XSS protection           |

**Delegation tests**:

- `data-action="refresh"` — trigger refresh
- `data-action="join-meeting"` — extract `data-url` and navigate
- Click outside action elements — no handler fired
- Single listener survives multiple `innerHTML` replacements

**XSS tests**:

- HTML special chars escaped (`<`, `>`, `&`, `"`, `'`)
- User content safe for innerHTML insertion

## COMMANDS

```bash
bun run test          # Run all tests once
bun run test:watch    # Watch mode
bun run test:coverage # Tests with coverage report
```

## UNTESTED MODULES

- `src/main/auto-launch.ts` — no test file exists
- `src/main/notification.ts` — no test file exists

## SETUP FILE

- `app`: getVersion, quit, dock, isPackaged, whenReady, on, getPath
- `BrowserWindow`: loadURL, show, hide, destroy, getBounds, setPosition, webContents
- `ipcMain`: handle, on, off
- `Tray`: setToolTip, setTitle, on, getBounds, popUpContextMenu
- `Menu`, `Notification`, `screen`, `nativeImage`
