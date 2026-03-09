# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## STRUCTURE

```
tests/
├── setup.main.ts     # Electron API mocks (62 lines)
├── main/
│   ├── scheduler.test.ts  # 373 lines — scheduler state machine tests
│   ├── calendar.test.ts   # 360 lines — Swift output parsing tests
│   └── ipc.test.ts        # 101 lines — IPC security validation tests
└── renderer/
    ├── delegation.test.ts # 77 lines — event delegation pattern tests
    └── escape-html.test.ts # 82 lines — XSS/HTML escaping tests
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

## MAIN PROCESS TESTS (906 lines)

**Mock Pattern**:

```typescript
vi.mock("electron", () => ({ shell, Notification, ... }));
vi.mock("../../src/main/calendar.js", () => ({ getCalendarEventsResult: vi.fn() }));
vi.mock("../../src/main/tray.js", () => ({ updateTrayTitle: vi.fn() }));
```

**Test Files**:

| File              | Lines | Focus                                  | Tests |
| ----------------- | ----- | -------------------------------------- | ----- |
| scheduler.test.ts | 373   | State machine, race conditions, timers | 18    |
| calendar.test.ts  | 360   | parseEvents, dedup, date filtering     | 16    |
| ipc.test.ts       | 101   | validateSender, isAllowedMeetUrl       | 16    |

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
- `firedEvents`, `timers`, `scheduledEventData` cleared in `beforeEach`
- `updateTrayTitle` mock for tray behavior assertions

## RENDERER TESTS (159 lines)

| File                | Lines | Focus                    | Tests |
| ------------------- | ----- | ------------------------ | ----- |
| delegation.test.ts  | 77    | Event delegation on #app | 4     |
| escape-html.test.ts | 82    | XSS protection           | 11    |

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

`tests/setup.main.ts` exports complete Electron mock:

- `app`: getVersion, quit, dock, isPackaged, whenReady, on
- `BrowserWindow`: loadURL, show, hide, destroy, getBounds, setPosition, webContents
- `ipcMain`: handle, on, off
- `Tray`: setToolTip, on, getBounds, popUpContextMenu
- `Menu`, `Notification`, `screen`, `nativeImage`

**Total**: 1,127 lines across 5 test files
