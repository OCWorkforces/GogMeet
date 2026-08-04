# Main Process Test Suite

## OVERVIEW

Vitest `main` project: Node environment plus `tests/setup.main.ts` Electron mock. Covers Electron main, composition graph, scheduler, calendar providers, Swift bridge, IPC, windows, tray/menu, system adapters, settings, preload.

## STRUCTURE

```text
tests/main/                         # flat *.test.ts (no scheduler/ subdirectory)
├── app-graph*.test.ts / lifecycle / app-bootstrap / index-bootstrap / bind-composition
├── scheduler-*.test.ts             # facade, poll, timers, plan-schedule, auto-open off, …
├── swift/                          # swift-helper-process, event-parser only
├── swift-binary-manager / swift-guards / calendar-watch-sidecar  # top-level (not under swift/)
├── calendar*.test.ts / google-* / fixture / offline-cache / refresh-coordinator / watcher
├── google-http / performance-trace / shell-meeting-opener / guardrails-security / after-pack
├── ipc*.test.ts                    # channels, typed wrappers, handlers, registrar
│                                   # ipc-handlers-scheduler.test.ts = negative (module must not exist)
├── tray / meeting-menu / *-window / window-chrome / dock-visibility
├── system adapters                 # power, display-horizon, shortcuts, notification, auto-launch, updater
└── utils                           # join-meeting, package-info, system-settings, log, …
```

Domain-pure suites (brand, url-extract, meet-url build, pick-join-target, settings defaults, etc.) live under **`tests/domain/`**, not here.

## SCHEDULER SUITES

| Area | Files |
| --- | --- |
| State machine | `scheduler.test.ts`, `scheduler-state-replace.test.ts` |
| Poll/restart races | `scheduler-poll.test.ts`, `scheduler-facade-force-poll.test.ts` (user vs auto coalesce), `scheduler-restart-preserves-suppression.test.ts` |
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
- `google-sync-tokens.test.ts` — encrypted nextSyncToken map (schema v1).
- `google-calendar.test.ts` — 401 force refresh, offline ok, complete/partial, incremental path, **pagination-limit** (calendarList / full / incremental at MAX_PAGES with remaining `nextPageToken`), **incremental 429** (no full fallback, preserve state).
- `offline-cache.test.ts` — encrypt round-trip (schema v1 metadata + ended filter).
- `calendar-refresh-coordinator.test.ts` — single-flight, follow-up queue, cancel, publication generation.
- `swift/swift-helper-process.test.ts` — real spawn bounds + kill paths.
- `swift/event-parser.test.ts` — field parsing, diagnostics, error classification.
- `swift-binary-manager.test.ts` — integrity-only recompile (top-level).
- `swift-guards.test.ts` / `calendar-watch-sidecar.test.ts` — guards + watch (top-level; mocked exec); sidecar **stdout/stderr byte ceilings** + overflow SIGTERM/SIGKILL.
- `performance-trace.test.ts` / `performance-trace-file.test.ts` — bounded redacted buffer (row/byte caps, phases) + fixed atomic userData flush.
- `shell-meeting-opener.test.ts` / `guardrails-security.test.ts` / `after-pack.test.ts` — egress, permanent guardrails, packaging hook.

Provider tests must pass `AbortController` signal into `getEvents`. Prefer `.As<T>()` for Electron mock shapes.

## IPC / PRELOAD / GRAPH

- Channel contracts: `ipc-channels.test.ts` (includes `APP_JOIN_MEETING`), `ipc-types.test.ts`.
- Boundary helpers: `ipc-handlers-shared.test.ts`.
- Domain handlers: `ipc-handlers-*.test.ts` — pass `testAppGraph()`; cover Result open + join-by-id; settings selective restart vs display-only `showCompletedTodayMeetings` tray rebuild.
- Registrar: `ipc-registrar.test.ts` tracks every handler from `src/main/app/ipc.ts`.
- Preload API: `preload.test.ts` — joinMeeting, domain allowlist, invoke/send/listeners.
- Composition: `app-graph.test.ts`; lifecycle asserts graph-first init + `initAutoUpdater` + resume revive.

## WINDOWS / SYSTEM / UTILS

- Tray/menu: `tray.test.ts` (setup with graph, menus, Windows left-click, history signature, user Refresh await+rebuild), `meeting-menu.test.ts` (join/poll callbacks + completed-today rows), `tray-rebuild-coalesce.test.ts` (incl. reschedule start/end signature).
- Windows: `alert-window` (queue + hide/reuse + destroy + **generation-safe** immediate/height/close), `settings-window` (520×760), `about-window` (320×380, aurora CSS/HTML, CSP, https-only repo, `isSafeAboutRepositoryUrl`), `browser-window`, `window-chrome` (`DIALOG_BACKGROUND_COLOR` `#0d1117`), `dock-visibility`.
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
