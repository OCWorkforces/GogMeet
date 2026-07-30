# GogMeet Tests — Knowledge Base

Vitest workspace (`vitest.workspace.ts`) with six projects. `main` runs in Node with Electron mocks; `renderer` in jsdom; `domain` / `application` / `shared` / `scripts` in plain Node.

## Projects

| Project | Env | Setup | Scope | Coverage floors (L/S/F/B) |
| --- | --- | --- | --- | --- |
| `domain` | Node | `setup.as.ts` | Pure `src/domain/**` | 90 / 90 / 90 / 80 |
| `application` | Node | `setup.as.ts` | Ports/use-case unit tests | 80 / 80 / 80 / 70 |
| `main` | Node | `setup.main.ts` (imports as) | Electron main, scheduler, providers, Swift, IPC, tray | 90 / 90 / 90 / 80 |
| `renderer` | jsdom | `setup.as.ts` | Browser-only UI | soft 70 / 70 / 70 / 50 |
| `shared` | Node | `setup.as.ts` | IPC contracts, cast helper | 90 / 90 / 80 / 80 |
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
├── domain/                # pure domain suites (incl. calendar-result)
├── application/           # use-case suites (get-meetings, join, disconnect)
├── main/                  # Node + Electron mock suites
│   └── swift/             # swift-helper-process, event-parser
├── renderer/              # jsdom suites
├── shared/                # as.test, contracts
├── scripts/               # validate-node, release, performance-report, bench fixtures
└── bench/                 # not in vitest.workspace.ts
```

## High-value main suites (non-exhaustive)

| Suite | Focus |
| --- | --- |
| `google-http.test.ts` | bounds, timeout, abort, error classes |
| `google-oauth.test.ts` / `google-token-store.test.ts` | force/if-needed, preserve ciphertext |
| `google-calendar.test.ts` | 401 force refresh, offline, provenance |
| `swift/swift-helper-process.test.ts` | real spawn bounds + kill paths |
| `swift-binary-manager.test.ts` | integrity-only recompile |
| `performance-trace.test.ts` | opt-in redacted traces |
| `scheduler-*.test.ts` | plan, timers, poll, forcePoll, auto-open off |

## Main-project mocks

`setup.main.ts` mocks `app`, `BrowserWindow`, `Tray`, `ipcMain`, `shell`, `dialog`, `nativeTheme`, `powerMonitor`, `powerSaveBlocker`, and `nativeImage`, and pulls in `setup.as.ts`.

Swift binary tests use `vi.hoisted()` plus process-runner mocks; helper-process tests use real Node children.

Mock source modules with `.js` import paths and current directories, e.g. `../../src/main/facades/calendar.js`.

## Common patterns

- File names: `[module].test.ts`; do not introduce `*.spec.ts`.
- Use `.js` extensions in imports/mocks.
- Prefer `.As<T>()` / free `As<T>(v)` over `as unknown as T`.
- Use `vi.useFakeTimers()` / `vi.useRealTimers()` around timer suites; prefer `vi.advanceTimersByTimeAsync()`.
- Reset stateful modules in `beforeEach`; scheduler suites use `poll._resetForTest()` and `facade._resetForceTestState()`.
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
- No packaged Electron app smoke test.
- Auto-updater download/install/relaunch lifecycle is mocked only.
- Poll still schedules any `isCalendarOk` (automation eligibility not gated yet).
- Some scheduler title-countdown tests depend on ordering because `resetState()` swaps singleton bindings.
