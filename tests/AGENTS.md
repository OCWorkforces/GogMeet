# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## STRUCTURE

```
tests/
├── setup.main.ts           # Full Electron mock (app, BrowserWindow, Tray, ipcMain, shell, etc.)
├── main/
│   ├── scheduler.test.ts   # 649 lines — scheduler state machine (26 tests, A-F groups)
│   ├── calendar.test.ts    # 405 lines — Swift output parsing (16 tests)
│   ├── meet-url.test.ts    # 140 lines — URL building + allowlist (17 tests)
│   ├── ipc.test.ts         # 102 lines — security validation (15 tests)
│   ├── settings.test.ts    # 204 lines — file I/O, clamping, launchAtLogin (11 tests)
│   ├── tray.test.ts        # 167 lines — tray title, time formatting (9 tests)
│   ├── notification.test.ts # 100 lines — notification permission (4 tests)
│   ├── auto-launch.test.ts # 98 lines — login item status/set/sync (6 tests)
│   ├── lifecycle.test.ts   # lifecycle init/shutdown orchestration
│   ├── app-bootstrap.test.ts # main/index.ts bootstrap
│   ├── alert-window.test.ts # alert window singleton
│   ├── settings-window.test.ts # settings window singleton
│   ├── shortcuts.test.ts   # global shortcut registration
│   ├── auto-updater.test.ts # electron-updater setup
│   ├── preload.test.ts     # preload bridge tests
│   ├── settings-defaults.test.ts # settings default values
│   ├── ipc-channels.test.ts # IPC channel definitions
│   ├── ipc-types.test.ts   # IPC type utilities
│   ├── ipc-registrar.test.ts # IPC registration
│   ├── ipc-handlers-app.test.ts # app IPC handler tests
│   ├── ipc-handlers-calendar.test.ts # calendar IPC handler tests
│   ├── ipc-handlers-settings.test.ts # settings IPC handler tests
│   ├── ipc-handlers-shared.test.ts # typedHandle + validateSender tests
│   ├── ipc-handlers-window.test.ts # window IPC handler tests
│   ├── package-info.test.ts # package.json reader
│   └── url-validation.test.ts # URL allowlist validation
│   ├── power.test.ts     # Power management (battery polling, sleep prevention)
└── renderer/
    ├── delegation.test.ts  # 77 lines — event delegation (4 tests)
    ├── escape-html.test.ts # 71 lines — XSS protection (11 tests)
    ├── main-ui.test.ts    # Main UI state machine
    ├── alert.test.ts      # Alert overlay behavior
    └── settings.test.ts   # Settings form logic
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

**Scheduler Test Groups** (A-F labeled):

| Group   | Focus                     |
| ------- | ------------------------- |
| A1-A7   | Event deletion/reschedule |
| B8-B13  | Title/URL/startTime changes |
| C10-C13 | Race conditions           |
| D14-D15 | Concurrent countdowns     |
| E16-E18 | Error handling            |
| F1-F5   | Poll IPC notification     |
| Wave 2  | Dirty flag for title resolution |

- `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for timer testing
- All state maps cleared in `beforeEach`: `timers`, `alertTimers`, `firedEvents`, `alertFiredEvents`, `scheduledEventData`, `countdownIntervals`, `titleDirty`, `inMeetingDirty`, `consecutiveErrors`
- `vi.resetModules()` + dynamic import for fresh module state

## RENDERER TESTS

| File                | Focus                    |
| ------------------- | ------------------------ |
| `delegation.test.ts`  | Event delegation on #app |
| `escape-html.test.ts` | XSS protection           |
| `main-ui.test.ts`     | Main UI state machine    |
| `alert.test.ts`       | Alert overlay behavior   |
| `settings.test.ts`    | Settings form logic      |

## COMMANDS

```bash
bun run test          # Run all tests once
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
