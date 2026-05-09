# Main Process Test Suite

## OVERVIEW

Tests for `src/main/` (30+ files, ~7000 lines). Uses Vitest with `setup.main.ts` which auto-mocks Electron APIs (`app`, `BrowserWindow`, `ipcMain`, `Tray`, etc.). All `vi.mock()` calls go in `setup.main.ts`, not inline.

## STRUCTURE

```
tests/main/
├── swift/              # Swift binary + event parsing tests
│   ├── event-parser.test.ts
│   └── ...
├── scheduler*.test.ts  # 5 files, state machine tests (A-F groups)
├── calendar.test.ts    # 603 lines, Swift output parsing
├── alert-window.test.ts
├── lifecycle.test.ts   # 248 lines, init/shutdown
├── ipc*.test.ts        # 9 files, IPC registrar + handlers
├── settings.test.ts
├── tray.test.ts
├── shortcuts.test.ts
└── ...
```

## KEY TEST FILES

### Scheduler Tests (5 files, ~3000 lines)
`scheduler.test.ts` — 806 lines, state machine A-F groups. Tests timer creation, deduplication, cancellation via `setupSchedulerForEvent`/`teardownEvent`.
`scheduler-poll.test.ts` — 480 lines, `startScheduler`/`stopScheduler`/`restartScheduler`/`forcePoll`. `FORCE_POLL_COALESCE_MS` = 10s coalescing.
`scheduler-title-countdown.test.ts` — 802 lines, tray title countdown. `MAX_CONSECUTIVE_ERRORS_CAP` = 4.
`scheduler-countdown.test.ts` — 491 lines, countdown timer per event.
`scheduler-browser-timer.test.ts` — 251 lines, browser auto-open timer.
`scheduler-alert-timer.test.ts` — alert timer, auto-open suppression.

### Calendar Tests
`calendar.test.ts` — 603 lines. Tests `parseEvents()` with 9-field tab-delimited Swift output, `CalendarResult` discriminated union, `isCalendarOk()`, diagnostics. Swift exit codes: 0=success, 2=permission, 3=no calendars, 4=error.

### Swift Tests
`swift-binary-manager.test.ts` — 454 lines. Hash-based binary cache in `/tmp/googlemeet/`, architecture-aware compile, retry on failure (5 retries, exp backoff). Mode 0o700.
`tests/main/swift/event-parser.test.ts` — 358 lines, tab-delimited field parsing, `cleanDescription`, `classifySwiftError`.

### IPC Tests (9 files)
`ipc.test.ts` — `IpcResponse<T>` discriminated union, `kind: "ok"|"err"` tag.
`ipc-handlers-*.test.ts` — 6 files, each domain handler tested with `mockIpcInvoke`/`mockIpcSend`.
`ipc-registrar.test.ts` — `registerIpcHandlers()` calls all register functions.

### Other Notable
`brand.test.ts` — EventId, MeetUrl, IsoUtc, WindowHeight validators.
`settings.test.ts` — 204 lines, persistent settings CRUD. `settings-defaults.test.ts` for schema.
`tray.test.ts` — tray icon rendering, context menu.
`shortcuts.test.ts` — 308 lines, Cmd+Shift+M shortcut.
`preload.test.ts` — preload context bridge API.
`power.test.ts`, `notification.test.ts`, `auto-launch.test.ts`, `auto-updater.test.ts`, `about-window.test.ts`.
`url-validation.test.ts` — allowlist validation, `validateMeetUrl()`, `Result<MeetUrl, string>`.
`time-utils.test.ts` — shared time formatting.

## TEST UTILITIES

`tests/helpers/test-utils.ts` — shared factories:
- `createMockEvent()`, `createMockIpcEvent()`
- `createMockSettings()`, `isoFromNow()`, `asTestEventId()`, `asTestMeetUrl()`, `asTestIsoUtc()`

## CONVENTIONS

- Each test file mirrors its source file's structure
- `mockIpcInvoke`/`mockIpcSend` wrappers used instead of raw `ipcMain` manipulation
- `vi.useFakeTimers()` for scheduler tests; advance with `vi.advanceTimersByTime()`
- `FORCE_POLL_COALESCE_MS` (10s) factored into poll timing tests

## ANTI-PATTERNS

- Never mock Electron APIs inline — use `setup.main.ts`
- Never skip `validateSender()` verification in IPC handler tests
- Never test implementation details of `setTimeout` — test observable state changes


