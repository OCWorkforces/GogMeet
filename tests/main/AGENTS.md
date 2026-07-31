# Main Process Test Suite

## OVERVIEW

Vitest `main` project: Node environment plus `tests/setup.main.ts` Electron mock. Covers Electron main, composition graph, scheduler, calendar providers, Swift bridge, IPC, windows, tray/menu, system adapters, settings, preload.

## STRUCTURE

```text
tests/main/
├── app-graph.test.ts / lifecycle.test.ts / app-bootstrap.test.ts
├── scheduler*.test.ts / scheduler/     # facade, poll, timers, plan-schedule, auto-open off
├── swift/ + swift-*.test.ts            # helper-process, parser, binary-manager, watch sidecar
├── calendar*.test.ts / google-* / fixture / offline-cache / refresh-coordinator
├── google-http.test.ts / performance-trace.test.ts
├── ipc*.test.ts                        # channels, typed wrappers, handlers, registrar
├── tray / meeting-menu / *-window / window-chrome
├── system adapters                     # power, display-horizon, shortcuts, notification, auto-launch, updater
└── utils                               # join-meeting, package-info, system-settings
```

Domain-pure suites (brand, url-extract, meet-url build, pick-join-target, settings defaults, etc.) live under **`tests/domain/`**, not here.

## SCHEDULER SUITES

| Area | Files |
| --- | --- |
| State machine | `scheduler.test.ts`, `scheduler-state-replace.test.ts` |
| Poll/restart races | `scheduler-poll.test.ts`, `scheduler-facade-force-poll.test.ts`, `scheduler-restart-preserves-suppression.test.ts` |
| Pure plan | `scheduler-plan-schedule.test.ts` |
| Browser/alert timers | `scheduler-browser-timer.test.ts`, `scheduler-alert-timer.test.ts`, `scheduler-auto-open-deadline.test.ts`, `scheduler-facade-cancel-browser-open.test.ts` |
| Late-join | `late-join.test.ts` (`firedEvents` only) |
| Tray countdown | `scheduler-title-countdown.test.ts`, `scheduler-countdown.test.ts` |

Use `vi.advanceTimersByTimeAsync()` when promise callbacks may flush. Rebind live Map/Set refs after scheduler resets when a suite stores local state refs.

## CALENDAR / PROVIDERS / SWIFT

- `calendar.test.ts` — facade over provider mocks, permission cache, provenance fixtures.
- `calendar-factory.test.ts` / `fixture-calendar.test.ts` — factory selection, fixture gate.
- `google-http.test.ts` — bounded transport (timeout, body limits, abort).
- `google-oauth.test.ts` / `google-token-store.test.ts` — force/if-needed refresh, preserve ciphertext.
- `google-calendar.test.ts` — 401 force refresh, offline ok, complete/partial.
- `offline-cache.test.ts` — encrypt round-trip (schema v1 metadata + ended filter).
- `calendar-refresh-coordinator.test.ts` — single-flight, follow-up queue, cancel, publication generation.
- `swift/swift-helper-process.test.ts` — real spawn bounds + kill paths.
- `swift-binary-manager.test.ts` — integrity-only recompile.
- `swift/event-parser.test.ts` — field parsing, diagnostics, error classification.
- `performance-trace.test.ts` — opt-in redacted trace primitive.

Provider tests must pass `AbortController` signal into `getEvents`. Prefer `.As<T>()` for Electron mock shapes.
- `swift-binary-manager.test.ts` / `calendar-watch-sidecar.test.ts` — compile/cache/watch (mocked exec).

## IPC / PRELOAD / GRAPH

- Channel contracts: `ipc-channels.test.ts` (includes `APP_JOIN_MEETING`), `ipc-types.test.ts`.
- Boundary helpers: `ipc-handlers-shared.test.ts`.
- Domain handlers: `ipc-handlers-*.test.ts` — pass `testAppGraph()`; cover Result open + join-by-id; settings selective restart vs display-only `showCompletedTodayMeetings` tray rebuild.
- Registrar: `ipc-registrar.test.ts` tracks every handler from `src/main/app/ipc.ts`.
- Preload API: `preload.test.ts` — joinMeeting, domain allowlist, invoke/send/listeners.
- Composition: `app-graph.test.ts`; lifecycle asserts graph-first init + `initAutoUpdater` + resume revive.

## WINDOWS / SYSTEM / UTILS

- Tray/menu: `tray.test.ts` (setup with graph, menus, Windows left-click, history signature), `meeting-menu.test.ts` (join/poll callbacks + completed-today rows), `tray-rebuild-coalesce.test.ts`.
- Windows: `alert-window`, `settings-window`, `browser-window`, `window-chrome`, `about-window`.
- System: `power`, `display-horizon`, `shortcuts` (graph + `join.byId`), `notification`, `auto-launch`, `auto-updater` (portable skip).
- Utils: `join-meeting.test.ts`, `system-settings.test.ts`, `package-info.test.ts`, `settings.test.ts`, `json-settings-store.test.ts` (v3 migrate).

## MOCKING RULES

- Default Electron mock in `tests/setup.main.ts`.
- Inline `vi.mock("electron", ...)` when a suite needs isolated import-time behavior.
- Mock source modules with `.js` specifiers.
- Dynamic import tests use `vi.resetModules()` before `await import(...)`.
- Prefer `testAppGraph` over ad-hoc partial graph objects.

## ANTI-PATTERNS

- Never skip sender validation coverage for IPC handlers.
- Never assert raw `setTimeout` implementation details when observable state changes can be tested.
- Never import renderer code into main tests; preload tests are the documented bridge exception.
- Do not reintroduce domain-pure suites here — put them under `tests/domain/`.
