# Main Process Test Suite

## OVERVIEW

Vitest `main` project: Node environment plus `tests/setup.main.ts` Electron mock. Covers Electron main, scheduler, calendar providers (factory/Google/fixture), Swift bridge, IPC, windows, tray/menu, system adapters, settings, preload.

## STRUCTURE

```
tests/main/
├── scheduler*.test.ts       # scheduler state, timers, facade, poll races, auto-open deadlines
├── swift/                   # parser-focused Swift JSON Lines tests
├── calendar*.test.ts        # domain facade, factory, fixture, token store
├── url-extract*.test.ts     # shared Meet/Zoom/Calendly extraction
├── ipc*.test.ts             # channel constants, typed wrappers, handlers, registrar
├── platform-os / window-chrome / after-pack
├── *-window.test.ts         # BrowserWindow factories
└── system/util suites       # power, shortcuts, notification, auto-launch, updater, tray
```

## SCHEDULER SUITES

| Area | Files |
| --- | --- |
| State machine | `scheduler.test.ts`, `scheduler-state-replace.test.ts` |
| Poll/restart races | `scheduler-poll.test.ts`, `scheduler-facade-force-poll.test.ts`, `scheduler-restart-preserves-suppression.test.ts` |
| Browser/alert timers | `scheduler-browser-timer.test.ts`, `scheduler-alert-timer.test.ts`, `scheduler-auto-open-deadline.test.ts`, `scheduler-facade-cancel-browser-open.test.ts` |
| Tray countdown | `scheduler-title-countdown.test.ts`, `scheduler-countdown.test.ts` |

Scheduler tests use fake timers heavily. Use `vi.advanceTimersByTimeAsync()` when promise callbacks may flush. Rebind live Map/Set refs after scheduler resets when a suite stores local state refs.

## CALENDAR / PROVIDERS / SWIFT

- `calendar.test.ts` — domain facade over Darwin provider mocks, JSON Lines parse diagnostics, permission cache.
- `calendar-factory.test.ts` / `fixture-calendar.test.ts` / `google-token-store.test.ts` — factory selection, K23 fixture gate, token schema.
- `url-extract.test.ts` — Zoom → Meet → Calendly priority + allowlist.
- `swift/event-parser.test.ts` — field parsing, diagnostics, `classifySwiftError` → `calendar-*` AppError.
- `swift-binary-manager.test.ts` / `calendar-watch-sidecar.test.ts` — compile/cache/watch (mocked exec; no real EventKit in CI).

## IPC / PRELOAD

- Channel contracts: `ipc-channels.test.ts`, `ipc-types.test.ts`.
- Boundary helpers: `ipc-handlers-shared.test.ts` for `validateSender`, `validateOnSender`, `typedHandle`, `typedSend`.
- Domain handlers: `ipc-handlers-calendar/settings/app/window/scheduler/alert.test.ts`.
- Registrar: `ipc-registrar.test.ts` must track every handler registered by `src/main/app/ipc.ts`.
- Preload API: `preload.test.ts` covers `contextBridge` exposure, invoke/send/listener wiring, and preload URL allowlist behavior.

## WINDOWS / SYSTEM / UTILS

- Bootstrap/lifecycle: `app-bootstrap.test.ts`, `lifecycle.test.ts`.
- Tray/menu: `tray.test.ts` (setup, menus, Windows left-click popup, tooltips); `meeting-menu.test.ts`.
- Windows: `alert-window`, `settings-window`, `browser-window`, `window-chrome`.
- System: `power`, `shortcuts`, `notification` (platform deep-links), `auto-launch`, `auto-updater` (portable skip).
- Domain/utils: `settings.test.ts`, `settings-defaults.test.ts`, `url-validation.test.ts`, `meet-url.test.ts`, `package-info.test.ts`, `brand.test.ts`, `time-utils.test.ts`.

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
