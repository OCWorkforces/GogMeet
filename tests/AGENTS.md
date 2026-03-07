# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## STRUCTURE

```
tests/
├── setup.main.ts     # Electron API mocks (app, BrowserWindow, ipcMain, Tray, etc.)
├── main/
│   └── scheduler.test.ts  # 445 lines — scheduler state machine tests
└── renderer/
    └── delegation.test.ts # 77 lines — event delegation pattern tests
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

## MAIN PROCESS TESTS

**File**: `tests/main/scheduler.test.ts` (445 lines)

**Mock Pattern**:

```typescript
vi.mock("electron", () => ({ shell, Notification, ... }));
vi.mock("../../src/main/calendar.js", () => ({ getCalendarEventsResult: vi.fn() }));
vi.mock("../../src/main/tray.js", () => ({ updateTrayTitle: vi.fn() }));
```

**Test Groups**:
| Group | Focus | Tests |
|-------|-------|-------|
| A | Event deletion/reschedule | A1-A7 |
| B | Title/URL changes | B8-B9 |
| C | Race conditions | C10-C13 |
| D | Concurrent countdowns | D14-D15 |
| E | Error handling | E16-E18 |

**Key Test Patterns**:

- `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for timer testing
- `firedEvents`, `timers`, `scheduledEventData` cleared in `beforeEach`
- `updateTrayTitle` mock for tray behavior assertions

## RENDERER TESTS

**File**: `tests/renderer/delegation.test.ts` (77 lines)

Tests delegated event listener pattern on `#app` container:

- `data-action="refresh"` — trigger refresh
- `data-action="join-meeting"` — extract `data-url` and navigate
- Click outside action elements — no handler fired
- Single listener survives multiple `innerHTML` replacements

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
