# GogMeet Tests — Knowledge Base

Vitest workspace (`vitest.workspace.ts`) with six projects. `main` runs in Node with Electron mocks; `renderer` in jsdom; `domain` / `application` / `shared` / `scripts` in plain Node.

## Projects

| Project | Env | Setup | Scope | Coverage floors (L/S/F/B) |
| --- | --- | --- | --- | --- |
| `domain` | Node | `setup.as.ts` | Pure `src/domain/**` | 90 / 90 / 90 / 80 |
| `application` | Node | `setup.as.ts` | Ports/use-case unit tests | 80 / 80 / 80 / 70 |
| `main` | Node | `setup.main.ts` (imports as) | Electron main, scheduler, providers, Swift, IPC, tray | 90 / 90 / 90 / 80 |
| `renderer` | jsdom | `setup.as.ts` | Browser-only UI | soft 70 / 70 / 70 / 50 |
| `shared` | Node | `setup.as.ts` | IPC contracts, cast helper, app-icon aurora | 90 / 90 / 80 / 80 |
| `scripts` | Node | `setup.as.ts` | Repository automation under `scripts/` | none |

Global coverage include: `src/**/*.{ts,tsx}` with floors **90 / 90 / 90 / 80**. Platform-edge excludes: `swift/calendar-watch-sidecar.ts`, `calendar/providers/darwin-eventkit.ts`.

Per-directory docs: `tests/main/AGENTS.md`, `tests/renderer/AGENTS.md`, `tests/shared/AGENTS.md`, `tests/helpers/AGENTS.md`, `tests/domain/AGENTS.md`, `tests/application/AGENTS.md`.

`tests/bench/` + `vitest.bench.config.ts` are benchmark-only — **not** in the normal workspace / coverage gate.

## Structure

```text
tests/
├── setup.main.ts          # Electron mock (main project)
├── setup.as.ts            # installs Object.prototype.As for all projects
├── helpers/               # test-utils, ipc-sender, app-graph
├── domain/                # pure domain suites (calendar-result, truncate-middle, meeting-time, …)
├── application/           # use-case suites (get-meetings, join, disconnect)
├── main/                  # Node + Electron mock suites (~84 top-level *.test.ts + swift/)
│   └── swift/             # swift-helper-process, event-parser only
├── renderer/              # jsdom suites (+ rendering/, utils/)
├── shared/                # as.test, contracts, app-icon-aurora
├── scripts/               # validate-node, release verifiers, guardrails, performance lab, latest.yml
└── bench/                 # calendar-parser, tray-menu, scheduler-poll, alert, ipc-handler, renderer-body
```

## High-value main suites (non-exhaustive)

| Suite | Focus |
| --- | --- |
| `google-http.test.ts` | bounds, timeout, abort, error classes |
| `google-oauth.test.ts` / `google-token-store.test.ts` | force/if-needed, preserve ciphertext |
| `google-sync-tokens.test.ts` | encrypted nextSyncToken map load/save/clear |
| `google-calendar.test.ts` | 401, offline, provenance, incremental, **pagination-limit**, **429**, multi-cal partial |
| `calendar-factory.test.ts` | platform selection + **probe fail-closed** |
| `calendar-refresh-coordinator.test.ts` | single-flight, follow-up, cancel, generation |
| `swift/swift-helper-process.test.ts` | real spawn bounds + kill paths |
| `swift-binary-manager.test.ts` | integrity-only recompile |
| `calendar-watch-sidecar.test.ts` | stream ceilings, overflow, restart budget |
| `performance-trace*.test.ts` / `performance-probe*.test.ts` | bounded traces, atomic flush, probe contract/drivers |
| `guardrails-security.test.ts` | freezes: SECURE prefs, bounds, `MAX_PAGES`, probe prefix |
| `scheduler-*.test.ts` | plan, timers, poll, forcePoll, auto-open off, automation eligibility |
| `meeting-menu.test.ts` / `tray*.test.ts` | completed-today history rows + cache signature + microtask rebuild coalesce |
| `display-horizon.test.ts` | wall-clock re-filter arm/fire |
| `alert-window.test.ts` | queue, coalesce, hide/reuse, destroy, generation-safe handoff |
| `about-window.test.ts` | 320×380, CSP meta, aurora markup, https-only openExternal, close sentinel |
| `settings-window.test.ts` / `window-chrome.test.ts` | 520×760; dialog canvas `#0d1117` |

## Main-project mocks

`setup.main.ts` mocks `app`, `commandLine`, `BrowserWindow`, `Tray`, `Menu`, `screen`, `Notification`, `clipboard`, `ipcMain`, `shell`, `dialog`, `nativeTheme`, `powerMonitor`, `powerSaveBlocker`, `nativeImage`, and `session`, and pulls in `setup.as.ts`.

Swift binary tests use `vi.hoisted()` plus process-runner mocks; helper-process tests use real Node children.

Mock source modules with `.js` import paths and current directories, e.g. `../../src/main/facades/calendar.js`.

## Common patterns

- File names: `[module].test.ts`; do not introduce `*.spec.ts`.
- Use `.js` extensions in imports/mocks.
- Prefer `.As<T>()` / free `As<T>(v)` over `as unknown as T`.
- Use `vi.useFakeTimers()` / `vi.useRealTimers()` around timer suites; prefer `vi.advanceTimersByTimeAsync()`.
- Reset stateful modules in `beforeEach`; scheduler suites import named `_resetForTest` / `_resetForceTestState` from poll/facade modules.
- Dynamic import tests use `vi.resetModules()` before `await import(...)`.
- For known-good branded fixtures, use `asTestEventId`, `asTestMeetUrl`, `asTestIsoUtc`; for calendar ok fixtures prefer `okCalendarResult` / explicit provenance fields.
- Graph-backed handlers: `testAppGraph(overrides)` from `tests/helpers/app-graph.ts`.
- Provider `getEvents` tests must pass `new AbortController().signal`.

## Helper policy

Prefer `tests/helpers/test-utils.ts` for fixtures and `tests/helpers/app-graph.ts` for IPC/handler graphs. Existing per-file factories may remain when they encode local suite behavior.

## Commands

```bash
bun run test
bun run test:watch
bun run test:coverage
bun run bench:calendar-parser
bun run perf:report -- --fixture synthetic
bun run perf:workspace-fingerprint
```

## Known gaps

- No integration tests spanning main + preload + renderer.
- No real EventKit/Swift/Google network execution in CI (mock fetch/exec).
- Packaged probe measurement is exercised via scripts + optional native `measurement.yml` jobs (not PR gates); unit tests mock heavy probe drivers.
- Auto-updater download/install/relaunch lifecycle is mocked only.
- Some scheduler title-countdown tests depend on ordering because `resetState()` swaps singleton bindings.

## Recent product contracts covered by tests

- Poll automation: live **complete** only (`isCalendarAutomationEligible`); partial/offline → `suspendAutomation`.
- Settings schema **v3**: `showCompletedTodayMeetings` defaults false; display-only IPC path (tray rebuild, no restart/poll).
- Completed-today history: domain `meeting-time` filters + tray/menu + popover body rendering.
- Meeting titles: domain `truncateMiddle` (max 25) in tray menu + popover.
- Google incremental sync tokens (schema v1) + provider merge/410 behavior.
- Alert window hide/reuse + generation-safe queue (`autoOpenAt` preserved; destroy never cancels browser-open).
- Settings/About brand aurora (`shared/utils/app-icon-aurora.ts`); About size 320×380 + aurora HTML assertions.
- Performance stability: Google pagination/429, watch stream bounds, bounded traces, packaged probe preflight (lab only).
