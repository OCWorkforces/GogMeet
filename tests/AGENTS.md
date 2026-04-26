# GogMeet Tests — Knowledge Base

## OVERVIEW

Vitest workspace with 2 projects: `main` (Node env) + `renderer` (jsdom env). Full Electron API mock auto-loaded via `setup.main.ts`. 677 tests across 48 files.

## STRUCTURE

```
tests/
├── setup.main.ts         # Global Electron mock (auto-loaded for main tests)
├── helpers/
│   └── test-utils.ts     # Shared factory functions (see TEST HELPERS below)
├── main/                 # 39 files, Node environment
│   ├── scheduler.test.ts                  # 806 lines, state machine (A-F groups)
│   ├── scheduler-poll.test.ts             # 480 lines, poll lifecycle
│   ├── scheduler-countdown.test.ts        # 491 lines, countdown logic
│   ├── scheduler-title-countdown.test.ts  # 802 lines, title timers
│   ├── scheduler-browser-timer.test.ts    # 251 lines, browser auto-open
│   ├── scheduler-alert-timer.test.ts      # Alert timer, auto-open suppression
│   ├── calendar.test.ts                   # 603 lines, Swift output parsing + HTML stripping + cleanDescription
│   ├── swift-binary-manager.test.ts       # 454 lines, binary cache/compile
│   ├── swift-guards.test.ts               # Runtime type guards
│   ├── swift/event-parser.test.ts         # 358 lines, parseEvents, cleanDescription, classifySwiftError
│   ├── alert-window.test.ts               # 367 lines, alert queue/race tests
│   ├── lifecycle.test.ts                  # 248 lines, init/shutdown
│   ├── meeting-menu.test.ts               # 419 lines, tray context menu
│   ├── shortcuts.test.ts                  # 308 lines, global shortcuts
│   ├── settings.test.ts                   # 204 lines, persistent settings
│   ├── settings-defaults.test.ts          # Default settings schema
│   ├── settings-window.test.ts            # Settings BrowserWindow singleton
│   ├── brand.test.ts                      # Branded type validators (EventId, MeetUrl, IsoUtc)
│   ├── ipc-channels.test.ts               # IPC channel constants
│   ├── ipc-types.test.ts                  # IPC response type safety
│   ├── ipc.test.ts                        # IPC handler registration
│   ├── ipc-registrar.test.ts              # Handler aggregation
│   ├── ipc-handlers-app.test.ts           # App IPC handlers
│   ├── ipc-handlers-calendar.test.ts      # Calendar IPC handlers
│   ├── ipc-handlers-settings.test.ts      # Settings IPC handlers + typedSend mocks
│   ├── ipc-handlers-shared.test.ts        # typedSend(), validateSender()
│   ├── ipc-handlers-window.test.ts        # Window control IPC
│   ├── tray.test.ts                       # Tray icon, menu, bounds
│   ├── browser-window.test.ts             # BrowserWindow factory, SECURE_WEB_PREFERENCES
│   ├── app-bootstrap.test.ts              # App entry point
│   ├── auto-launch.test.ts                # Launch-at-login
│   ├── auto-updater.test.ts               # Auto-update lifecycle
│   ├── notification.test.ts               # macOS notification
│   ├── package-info.test.ts               # package.json reading
│   ├── power.test.ts                      # Power management, poll interval
│   ├── preload.test.ts                    # Context bridge API structure
│   ├── meet-url.test.ts                   # Meet URL building
│   ├── url-validation.test.ts             # MEET_URL_ALLOWLIST, exact hostname match
│   └── time-utils.test.ts                 # Time formatting
└── renderer/             # 9 files, jsdom environment
    ├── main-ui.test.ts                    # 523 lines, popover state machine
    ├── alert.test.ts                      # Alert overlay, formatTimeRange
    ├── delegation.test.ts                 # data-action event delegation
    ├── escape-html.test.ts                # XSS protection
    ├── settings.test.ts                   # Settings form
    ├── rendering/body.test.ts             # 340 lines, meeting list HTML rendering
    ├── utils/escape-html.test.ts          # escapeHtml unit test
    ├── utils/result.test.ts               # Result<T,E> helpers
    └── utils/time.test.ts                 # Time formatting in renderer
```

## MOCK PATTERNS

**Electron API** (`setup.main.ts`, global): full mock of `app`, `BrowserWindow`, `Tray`, `ipcMain`, `shell`, `dialog`, `nativeTheme`, `powerMonitor`, `powerSaveBlocker`, `nativeImage`.

`BrowserWindow` shape: `Object.assign(vi.fn().mockImplementation(() => ({...})), { getAllWindows: vi.fn() })`. Access constructor options via `vi.mocked(BrowserWindow).mock.calls[0][0]`.

BrowserWindow mocks must include `isDestroyed: vi.fn().mockReturnValue(false)` for typedSend tests.

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

| Helper                | Signature                                                                            | Source                       | Purpose                                  |
| --------------------- | ------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------------------- |
| `createMockEvent()`   | `(overrides?) => MeetingEvent`                                                       | `tests/helpers/test-utils.ts`| Factory with defaults (5 min from now)   |
| `createMockSettings()`| `(overrides?) => AppSettings`                                                        | `tests/helpers/test-utils.ts`| Full AppSettings from DEFAULT_SETTINGS   |
| `createMockIpcEvent()`| `(sender?) => IpcMainInvokeEvent`                                                    | `tests/helpers/test-utils.ts`| IpcMainInvokeEvent with file:// sender   |
| `isoFromNow()`        | `(minutes: number) => string`                                                        | `tests/helpers/test-utils.ts`| ISO timestamp relative to now            |
| `asTestEventId()`     | `(raw: string) => EventId`                                                           | `tests/helpers/test-utils.ts`| Brand validator that throws on invalid   |
| `asTestIsoUtc()`      | `(raw: string) => IsoUtc`                                                            | `tests/helpers/test-utils.ts`| Brand validator that throws on invalid   |
| `asTestMeetUrl()`     | `(raw: string) => MeetUrl`                                                           | `tests/helpers/test-utils.ts`| Brand validator that throws on invalid   |
| `makeEvent()`         | `(overrides?) => MeetingEvent`                                                       | per-file (scheduler tests)   | Older per-file factory, same as createMockEvent |
| `makeSwiftLine()`     | `(id, title, start, end, url, cal, allDay, email?, notes?) => string`                | per-file (event-parser tests)| Tab-delimited 9-field Swift output line  |

## PATTERNS

- **Timer faking**: `vi.useFakeTimers()` in `beforeEach`, `vi.useRealTimers()` in `afterEach`. Advance with `vi.advanceTimersByTimeAsync(ms)` or `vi.advanceTimersByTime(ms)`.
- **Stateful modules**: clear Maps/Sets in `beforeEach` (`timers.clear()`, `firedEvents.clear()`). Call `_resetForTest()` for scheduler state.
- **Module reload**: `vi.resetModules(); await import("../../src/main/module.js")` for dynamic import tests.
- **IPC validation**: test `validateSender()` with `file://` (accept) vs `https://` (reject).
- **Brand validators**: tests follow `Result<T,string>` pattern, test both `.ok` and `.error` cases.

## CONVENTIONS

- One test file per source module: `[module].test.ts`
- No `*.spec.ts`, always `*.test.ts`
- Module mocks use `.js` extension matching source import paths
- Relative paths from test file to source (`../../src/main/...`)
- `passWithNoTests: true` in workspace config

## COMMANDS

```bash
bun run test           # Run all 677 tests (12 IPC channels)
bun run test:watch     # Watch mode
bun run test:coverage  # With v8 coverage
```

## COVERAGE GAPS

Notable areas **not** covered by tests:

- **No integration tests** — no tests spanning main+renderer together, no real EventKit/Swift, no packaged Electron app
- **`validateSender()` behavior** — `ipc-handlers-shared.test.ts` tests structure but not actual `file://` accept vs `https://` reject behavior
- **Alert dismiss** — `alert.test.ts` tests `formatTimeRange` but not Escape key dismiss or animation sequence
- **Auto-updater full flow** — download, install, relaunch lifecycle not exercised
- **Power save blocker lifecycle** — `power.test.ts` tests poll intervals but not `powerSaveBlocker.start/stop`
- **`src/shared/app-state.ts`** — AppState type not tested in isolation
- **Scheduler title-countdown ordering** — `scheduler-title-countdown.test.ts:780-782` contains a NOTE: the `resetState()` describe group MUST run last (swaps module-level singleton binding, breaking earlier tests that destructured state at file load time)
