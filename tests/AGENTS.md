# GogMeet Tests — Knowledge Base

## OVERVIEW

Vitest workspace with 2 projects: `main` (Node env) + `renderer` (jsdom env). Full Electron API mock auto-loaded via `setup.main.ts`. 516 tests across 40 files.

## STRUCTURE

```
tests/
├── setup.main.ts         # Global Electron mock (auto-loaded for main tests)
├── main/                 # ~511 tests, Node environment
│   ├── scheduler.test.ts                  # 776 lines, state machine (A-F groups)
│   ├── scheduler-poll.test.ts             # 466 lines, poll lifecycle
│   ├── scheduler-countdown.test.ts        # 491 lines, countdown logic
│   ├── scheduler-title-countdown.test.ts  # 500 lines, title timers
│   ├── scheduler-browser-timer.test.ts    # 251 lines, browser auto-open
│   ├── calendar.test.ts                   # 525 lines, Swift output parsing
│   ├── swift-binary-manager.test.ts       # 447 lines, binary cache/compile
│   ├── alert-window.test.ts               # 366 lines, alert queue/race tests
│   ├── lifecycle.test.ts                  # 212 lines, init/shutdown
│   ├── meeting-menu.test.ts               # 419 lines, tray context menu
│   ├── shortcuts.test.ts                  # 304 lines, global shortcuts
│   ├── settings.test.ts                   # 204 lines, persistent settings
│   └── [module].test.ts                   # One per source module
└── renderer/             # ~5 tests, jsdom environment
    ├── main-ui.test.ts                    # 523 lines, popover state machine
    ├── delegation.test.ts                 # Event delegation
    ├── escape-html.test.ts                # XSS protection
    ├── alert.test.ts                      # Alert overlay
    └── settings.test.ts                   # Settings form
```

## MOCK PATTERNS

**Electron API** (`setup.main.ts`, global): full mock of `app`, `BrowserWindow`, `Tray`, `ipcMain`, `shell`, `dialog`, `nativeTheme`, `powerMonitor`, `powerSaveBlocker`, `nativeImage`.

`BrowserWindow` shape: `Object.assign(vi.fn().mockImplementation(() => ({...})), { getAllWindows: vi.fn() })`. Access constructor options via `vi.mocked(BrowserWindow).mock.calls[0][0]`.

**Swift binary** (`vi.hoisted` + `promisify.custom`):
```typescript
const { execFileAsyncMock } = vi.hoisted(() => ({ execFileAsyncMock: vi.fn() }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const fn = Object.assign(vi.fn(), { [promisify.custom]: execFileAsyncMock });
  return { execFile: fn };
});
```

**Internal modules** (relative paths, `.js` extension):
```typescript
vi.mock("../../src/main/calendar.js", () => ({ getCalendarEventsResult: vi.fn() }));
vi.mock("../../src/main/power.js", () => ({ getPollInterval: vi.fn().mockReturnValue(120_000) }));
```

## TEST HELPERS

| Helper           | Signature                                                                       | Purpose                                  |
| ---------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| `makeEvent()`    | `(overrides?) => MeetingEvent`                                                  | Factory with defaults (5 min from now)   |
| `makeSwiftLine()`| `(id, title, start, end, url, cal, allDay, email?, notes?) => string`           | Tab-delimited 9-field line               |
| `isoFromNow()`   | `(minutes) => string`                                                           | ISO timestamp relative to now            |

## PATTERNS

- **Timer faking**: `vi.useFakeTimers()` in `beforeEach`, `vi.useRealTimers()` in `afterEach`. Advance with `vi.advanceTimersByTimeAsync(ms)` or `vi.advanceTimersByTime(ms)`.
- **Stateful modules**: clear Maps/Sets in `beforeEach` (`timers.clear()`, `firedEvents.clear()`). Call `_resetForTest()` for scheduler state.
- **Module reload**: `vi.resetModules(); await import("../../src/main/module.js")` for dynamic import tests.
- **IPC validation**: test `validateSender()` with `file://` (accept) vs `https://` (reject).

## CONVENTIONS

- One test file per source module: `[module].test.ts`
- No `*.spec.ts`, always `*.test.ts`
- Module mocks use `.js` extension matching source import paths
- Relative paths from test file to source (`../../src/main/...`)
- `passWithNoTests: true` in workspace config

## COMMANDS

```bash
bun run test           # Run all 516 tests
bun run test:watch     # Watch mode
bun run test:coverage  # With v8 coverage
```
