# Main Process Test Suite

## OVERVIEW

Vitest `main` project: Node environment plus `tests/setup.main.ts` Electron mock. Covers Electron main, scheduler, Swift bridge, IPC, windows, tray/menu, system adapters, settings, preload, and shared contracts used by main.

## STRUCTURE

```
tests/main/
├── scheduler*.test.ts       # scheduler state, timers, facade, poll races, auto-open deadlines
├── swift/                   # parser-focused Swift output tests
├── ipc*.test.ts             # channel constants, typed wrappers, handlers, registrar
├── calendar*.test.ts        # calendar domain and watch sidecar boundaries
├── *-window.test.ts         # BrowserWindow factories and alert/settings windows
└── system/util suites       # power, shortcuts, notification, auto-launch, updater, URL helpers
```

## SCHEDULER SUITES

| Area | Files |
| --- | --- |
| State machine | `scheduler.test.ts`, `scheduler-state-replace.test.ts` |
| Poll/restart races | `scheduler-poll.test.ts`, `scheduler-facade-force-poll.test.ts`, `scheduler-restart-preserves-suppression.test.ts` |
| Browser/alert timers | `scheduler-browser-timer.test.ts`, `scheduler-alert-timer.test.ts`, `scheduler-auto-open-deadline.test.ts`, `scheduler-facade-cancel-browser-open.test.ts` |
| Late-join | `late-join.test.ts` (eligibility + grace; `firedEvents` only) |
| Tray countdown | `scheduler-title-countdown.test.ts`, `scheduler-countdown.test.ts` |

Scheduler tests use fake timers heavily. Use `vi.advanceTimersByTimeAsync()` when promise callbacks may flush. Rebind live Map/Set refs after scheduler resets when a suite stores local state refs.

## CALENDAR / SWIFT

- `calendar.test.ts` covers `CalendarResult`, 9-string JSON Lines Swift output, diagnostics, and permission status/request cache behavior.
- `swift/event-parser.test.ts` covers field parsing, diagnostics, sorting, URL/note cleanup, and `classifySwiftError()`.
- `swift-binary-manager.test.ts` covers `/tmp/googlemeet` cache paths, source hash, compile target flags, retry/recompile behavior, and `promisify.custom` exec mocks.
- `calendar-watch-sidecar.test.ts` covers the Node-managed `swift --watch` sidecar restart, debounce, stable-runtime reset, cooldown/revive, and stop behavior.
- Production Swift exit classification is covered via binary-manager + calendar domain paths (no recompile on 2/3/4).

## IPC / PRELOAD

- Channel contracts: `ipc-channels.test.ts` (includes `APP_JOIN_MEETING`), `ipc-types.test.ts`.
- Boundary helpers: `ipc-handlers-shared.test.ts` for `validateSender`, `validateOnSender`, `typedHandle`, `typedSend`.
- Domain handlers: `ipc-handlers-calendar/settings/app/window/scheduler/alert.test.ts` — app handlers cover Result open + join-by-id; settings cover selective restart + `forcePoll` mock.
- Registrar: `ipc-registrar.test.ts` must track every handler registered by `src/main/app/ipc.ts`.
- Preload API: `preload.test.ts` covers `joinMeeting`, allowlist via shared module, invoke/send/listeners.

## WINDOWS / SYSTEM / UTILS

- Bootstrap/lifecycle: `app-bootstrap.test.ts`, `lifecycle.test.ts` (assert `initAutoUpdater`, resume → revive watcher).
- Tray/menu/windows: `tray.test.ts`, `meeting-menu.test.ts` (Join/Copy submenu, Refresh, Join Next, status rows), `alert-window.test.ts`, `settings-window.test.ts`, `browser-window.test.ts`.
- System adapters: `power.test.ts`, `shortcuts.test.ts` (in-progress pick + `joinMeetingById`), `notification.test.ts`, `auto-launch.test.ts`, `auto-updater.test.ts`.
- Domain/utils: `settings.test.ts` / `settings-defaults.test.ts` (schema v2), `join-meeting.test.ts`, `system-settings.test.ts`, `url-validation.test.ts`, `meet-url.test.ts`, `package-info.test.ts`, `brand.test.ts`, `time-utils.test.ts`.

## MOCKING RULES

- `tests/setup.main.ts` is the default Electron mock: `app`, `BrowserWindow`, `Tray`, `ipcMain`, `shell`, `dialog`, `nativeTheme`, `powerMonitor`, `powerSaveBlocker`, `nativeImage`.
- Inline `vi.mock("electron", ...)` is allowed when a suite needs isolated import-time behavior or a narrower Electron surface.
- Tray native-menu tests should expose `setContextMenu` on the `Tray` mock and assert first-click readiness by checking setup-time installation, not by relying on `popUpContextMenu()` inside a click handler.
- Mock source modules with `.js` specifiers, matching production imports.
- Dynamic import tests use `vi.resetModules()` before `await import(...)`.

## TEST UTILITIES

Use `tests/helpers/test-utils.ts` for shared factories: `createMockEvent`, `createMockSettings`, `createMockIpcEvent`, `isoFromNow`, `asTestEventId`, `asTestMeetUrl`, `asTestIsoUtc`. For validator failure paths, call production validators and inspect the returned `Result`.

## ANTI-PATTERNS

- Never skip sender validation coverage for IPC handlers.
- Never assert raw `setTimeout` implementation details when observable state changes can be tested.
- Never import renderer code into main tests; preload tests are the documented bridge exception.
