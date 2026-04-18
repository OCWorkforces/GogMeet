# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## STRUCTURE

```
tests/
├── setup.main.ts           # Full Electron mock (app, BrowserWindow, Tray, ipcMain, shell, etc.)
├── main/                   # 35 test files
│   ├── scheduler.test.ts   # 768 lines — scheduler state machine (A-F groups)
│   ├── swift-binary-manager.test.ts # Swift binary cache, compile, retry (19 tests)
│   ├── calendar.test.ts    # 532 lines — Swift output parsing (16 tests)
│   ├── meet-url.test.ts    # URL building + allowlist (17 tests)
│   ├── ipc.test.ts         # Security validation (15 tests)
│   ├── settings.test.ts    # File I/O, clamping, launchAtLogin (11 tests)
│   ├── tray.test.ts        # Tray title, time formatting (9 tests)
│   ├── notification.test.ts # Notification permission (4 tests)
│   ├── auto-launch.test.ts # Login item status/set/sync (6 tests)
│   ├── power.test.ts       # Battery polling, sleep prevention (10 tests)
│   ├── lifecycle.test.ts   # Lifecycle init/shutdown orchestration
│   ├── app-bootstrap.test.ts # main/index.ts bootstrap
│   ├── alert-window.test.ts # Alert window singleton
│   ├── settings-window.test.ts # Settings window singleton
│   ├── shortcuts.test.ts   # Global shortcut registration
│   ├── auto-updater.test.ts # electron-updater setup
│   ├── preload.test.ts     # Preload bridge tests
│   ├── settings-defaults.test.ts # Settings default values
│   ├── ipc-channels.test.ts # IPC channel definitions
│   ├── ipc-types.test.ts   # IPC type utilities
│   ├── ipc-registrar.test.ts # IPC registration
│   ├── ipc-handlers-app.test.ts # App IPC handler tests
│   ├── ipc-handlers-calendar.test.ts # Calendar IPC handler tests
│   ├── ipc-handlers-settings.test.ts # Settings IPC handler tests
│   ├── ipc-handlers-shared.test.ts # typedHandle + validateSender tests
│   ├── ipc-handlers-window.test.ts # Window IPC handler tests
│   ├── meeting-menu.test.ts # Tray meeting menu
│   ├── package-info.test.ts # package.json reader
│   ├── time-utils.test.ts  # Shared time utilities
│   ├── url-validation.test.ts # URL allowlist validation
│   ├── scheduler-alert-timer.test.ts # Alert timer scheduling
│   └── scheduler-browser-timer.test.ts # Browser timer scheduling
└── renderer/               # 5 test files
    ├── delegation.test.ts  # Event delegation on #app
    ├── escape-html.test.ts # XSS protection
    ├── main-ui.test.ts     # Main UI state machine
    ├── alert.test.ts       # Alert overlay behavior
    └── settings.test.ts    # Settings form logic
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

**Mock Pattern**:

```typescript
vi.mock("electron", () => ({ shell, Notification, ... }));
vi.mock("../../src/main/calendar.js", () => ({ getCalendarEventsResult: vi.fn() }));
vi.mock("../../src/main/tray.js", () => ({ updateTrayTitle: vi.fn() }));
```

**child_process Mock** (for Swift binary):

```typescript
const { execFileAsyncMock } = vi.hoisted(() => ({
  execFileAsyncMock: vi.fn(),
}));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const fn = Object.assign(vi.fn(), { [promisify.custom]: execFileAsyncMock });
  return { execFile: fn };
});
```

Note: `vi.hoisted()` + `promisify.custom` for `child_process` mocking; `vi.stubGlobal('process', ...)` for arch variation (used in `swift-binary-manager.test.ts`).

**Scheduler Test Groups** (A-F labeled):

| Group   | Focus                           |
| ------- | ------------------------------- |
| A1-A7   | Event deletion/reschedule       |
| B8-B13  | Title/URL/startTime changes     |
| C10-C13 | Race conditions                 |
| D14-D15 | Concurrent countdowns           |
| E16-E18 | Error handling                  |
| F1-F5   | Poll IPC notification           |
| Wave 2  | Dirty flag for title resolution |

- `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for timer testing
- All state maps cleared in `beforeEach`: `timers`, `alertTimers`, `firedEvents`, `alertFiredEvents`, `scheduledEventData`, `countdownIntervals`, `titleDirty`, `inMeetingDirty`, `consecutiveErrors`
- `vi.resetModules()` + dynamic import for fresh module state
- Factory helper: `makeEvent(overrides: Partial<MeetingEvent>)` creates test events

## RENDERER TESTS

| File                  | Focus                    |
| --------------------- | ------------------------ |
| `delegation.test.ts`  | Event delegation on #app |
| `escape-html.test.ts` | XSS protection           |
| `main-ui.test.ts`     | Main UI state machine    |
| `alert.test.ts`       | Alert overlay behavior   |
| `settings.test.ts`    | Settings form logic      |

## COMMANDS

```bash
bun run test          # Run all tests once (518 tests, 40 files)
bun run test:watch    # Watch mode
bun run test:coverage # Tests with coverage report
```

## SETUP FILE (`setup.main.ts`)

Mocks full Electron API:

- `app`: getVersion, quit, dock, isPackaged, whenReady, on, getPath
- `BrowserWindow`: loadURL, show, hide, destroy, getBounds, setPosition, webContents
- `ipcMain`: handle, on, off
- `Tray`: setToolTip, setTitle, on, getBounds, popUpContextMenu
- `Menu`, `Notification`, `screen`, `nativeImage`
- `powerMonitor`: onBatteryPower, on event listeners
- `powerSaveBlocker`: start, stop
