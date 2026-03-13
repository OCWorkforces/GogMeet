# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## STRUCTURE

```
tests/
├── setup.main.ts     # Electron API mocks (78 lines)
├── main/
│   ├── scheduler.test.ts  # 449 lines — scheduler state machine
│   ├── calendar.test.ts   # 360 lines — Swift output parsing
│   ├── settings.test.ts   # ~180 lines — file I/O, launchAtLogin
│   ├── tray.test.ts       # 183 lines — tray module
│   ├── ipc.test.ts        # 102 lines — security validation
│   └── meet-url.test.ts   # 140 lines — URL building
└── renderer/
    ├── delegation.test.ts # 77 lines — event delegation
    └── escape-html.test.ts # 71 lines — XSS protection
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

## MAIN PROCESS TESTS (104 tests total)

**Mock Pattern**:

```typescript
vi.mock("electron", () => ({ shell, Notification, ... }));
vi.mock("../../src/main/calendar.js", () => ({ getCalendarEventsResult: vi.fn() }));
vi.mock("../../src/main/tray.js", () => ({ updateTrayTitle: vi.fn() }));
```

**Test Files**:

| File              | Lines | Focus                                  |
| ----------------- | ----- | -------------------------------------- |
| scheduler.test.ts | 449   | State machine, race conditions, timers |
| calendar.test.ts  | 360   | parseEvents, dedup, date filtering     |
| settings.test.ts  | ~180  | File I/O, clamping, defaults, launchAtLogin |
| tray.test.ts      | 183   | Tray title, time formatting            |
| ipc.test.ts       | 102   | validateSender, isAllowedMeetUrl       |
| meet-url.test.ts  | 140   | URL building with authuser             |

**Scheduler Test Groups** (A-E labeled):

| Group   | Focus                     |
| ------- | ------------------------- |
| A1-A7   | Event deletion/reschedule |
| B8-B9   | Title/URL changes         |
| C10-C13 | Race conditions           |
| D14-D15 | Concurrent countdowns     |
| E16-E18 | Error handling            |

**Key Test Patterns**:

- `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for timer testing
- All state maps cleared in `beforeEach`: `timers`, `firedEvents`, `scheduledEventData`, `countdownIntervals`
- `updateTrayTitle` mock for tray behavior assertions
- `vi.resetModules()` + dynamic import for fresh module state

## RENDERER TESTS (148 lines)

| File                | Lines | Focus                    | Tests |
| ------------------- | ----- | ------------------------ | ----- |
| delegation.test.ts  | 77    | Event delegation on #app | 4     |
| escape-html.test.ts | 71    | XSS protection           | 11    |

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
bun run test        # Run all tests once
bun run test:watch  # Watch mode
```

## SETUP FILE

- `app`: getVersion, quit, dock, isPackaged, whenReady, on, getPath
- `BrowserWindow`: loadURL, show, hide, destroy, getBounds, setPosition, webContents
- `ipcMain`: handle, on, off
- `Tray`: setToolTip, setTitle, on, getBounds, popUpContextMenu
- `Menu`, `Notification`, `screen`, `nativeImage`
