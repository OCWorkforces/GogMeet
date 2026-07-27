# GogMeet Tests — Knowledge Base

Vitest workspace (`vitest.workspace.ts`) with six projects. `main` runs in Node with Electron mocks; `renderer` in jsdom; `domain` / `application` / `shared` / `scripts` in plain Node.

## Projects

| Project | Env | Setup | Scope |
| --- | --- | --- | --- |
| `domain` | Node | none | Pure `src/domain/**` (brands, policies, services). Coverage floors 80/80/70/80 |
| `application` | Node | none | Ports/use-case unit tests without Electron |
| `main` | Node | `tests/setup.main.ts` | Electron main, scheduler, providers, Swift, IPC, tray, composition |
| `renderer` | jsdom | none | Browser-only UI |
| `shared` | Node | none | Residual shared contract tests (folder may be sparse after domain extract) |
| `scripts` | Node | none | Repository automation under `scripts/` |

Per-directory docs: `tests/main/AGENTS.md`, `tests/renderer/AGENTS.md`, `tests/shared/AGENTS.md`, `tests/helpers/AGENTS.md`. `tests/bench/` is benchmark-only and not in the normal workspace.

Main project coverage has soft thresholds (lines/statements 60, functions 55, branches 45).

## Structure

```text
tests/
├── setup.main.ts          # Electron mock (main project only)
├── helpers/               # test-utils, ipc-sender, app-graph
├── domain/                # pure domain suites
├── application/           # use-case suites
├── main/                  # Node + Electron mock suites
├── renderer/              # jsdom suites
├── shared/                # Node-only shared residual suites
├── scripts/               # validate-node, release, next-beta-tag helpers
└── bench/                 # not in vitest.workspace.ts
```

Total test count changes often; run `bun run test` for authoritative numbers.

## Main-project mocks

`setup.main.ts` mocks `app`, `BrowserWindow`, `Tray`, `ipcMain`, `shell`, `dialog`, `nativeTheme`, `powerMonitor`, `powerSaveBlocker`, and `nativeImage`.

Swift binary tests use `vi.hoisted()` plus `promisify.custom` on a mocked `execFile`.

Mock source modules with `.js` import paths and current directories, e.g. `../../src/main/facades/calendar.js`, `../../src/main/composition/app-graph.js`.

## Common patterns

- File names: `[module].test.ts`; do not introduce `*.spec.ts`.
- Use `.js` extensions in imports/mocks.
- Use `vi.useFakeTimers()` / `vi.useRealTimers()` around timer suites; prefer `vi.advanceTimersByTimeAsync()`.
- Reset stateful modules in `beforeEach`; scheduler suites use `poll._resetForTest()` and `facade._resetForceTestState()`.
- Dynamic import tests use `vi.resetModules()` before `await import(...)`.
- For known-good branded fixtures, use `asTestEventId`, `asTestMeetUrl`, `asTestIsoUtc` from helpers; for validator failures, call domain validators and inspect `Result`.
- Graph-backed handlers: `testAppGraph(overrides)` from `tests/helpers/app-graph.ts`.

## Helper policy

Prefer `tests/helpers/test-utils.ts` for fixtures and `tests/helpers/app-graph.ts` for IPC/handler graphs. Existing per-file factories may remain when they encode local suite behavior (`makeSwiftLine`, scheduler-specific `makeEvent`).

## Commands

```bash
bun run test
bun run test:watch
bun run test:coverage
```

## Known gaps

- No integration tests spanning main + preload + renderer.
- No real EventKit/Swift/Google network execution in CI (mock fetch/exec).
- No packaged Electron app smoke test.
- Auto-updater download/install/relaunch lifecycle is mocked only.
- Some scheduler title-countdown tests depend on ordering because `resetState()` swaps singleton bindings.
