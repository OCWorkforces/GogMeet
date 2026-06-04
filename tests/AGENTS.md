# GogMeet Tests — Knowledge Base

Vitest workspace with four projects. `main` runs in Node with Electron mocks, `renderer` runs in jsdom, `shared` runs in plain Node, and `scripts` covers repository automation helpers.

## Projects

| Project | Env | Setup | Scope |
| --- | --- | --- | --- |
| `main` | Node | `tests/setup.main.ts` | Electron main process, scheduler, Swift, IPC, windows, utilities. |
| `renderer` | jsdom | none | Browser-only UI rendering and interaction tests. |
| `shared` | Node | none | Process-neutral shared contracts/utilities. |
| `scripts` | Node | none | Repository automation scripts under `scripts/`; no Electron mocks. |

Per-directory docs: `tests/main/AGENTS.md`, `tests/renderer/AGENTS.md`, `tests/shared/AGENTS.md`, `tests/helpers/AGENTS.md`.

## Structure

```
tests/
├── setup.main.ts          # Electron mock, loaded only by main project
├── helpers/test-utils.ts  # shared factories and brand wrappers
├── main/                  # Node + Electron mock suites
├── renderer/              # jsdom suites, no Electron mock
├── shared/                # Node-only shared suites
└── scripts/               # Node-only repository script suites
```

Total test count changes often; run `bun run test` for authoritative numbers.

## Main-project mocks

`setup.main.ts` mocks `app`, `BrowserWindow`, `Tray`, `ipcMain`, `shell`, `dialog`, `nativeTheme`, `powerMonitor`, `powerSaveBlocker`, and `nativeImage`.

BrowserWindow constructors are `vi.fn()` objects with `BrowserWindow.getAllWindows`. Inspect options through `vi.mocked(BrowserWindow).mock.calls[0][0]`. Include `isDestroyed: vi.fn().mockReturnValue(false)` when testing `typedSend()` paths.

Swift binary tests use `vi.hoisted()` plus `promisify.custom` on a mocked `execFile`:

```typescript
const { execFileAsyncMock } = vi.hoisted(() => ({ execFileAsyncMock: vi.fn() }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: execFileAsyncMock }) };
});
```

Mock source modules with `.js` import paths and current directories, e.g. `../../src/main/domain/calendar.js` and `../../src/main/system/power.js`.

## Common patterns

- File names: `[module].test.ts`; do not introduce `*.spec.ts`.
- Use `.js` extensions in imports/mocks, matching source conventions.
- Use `vi.useFakeTimers()` / `vi.useRealTimers()` around timer suites; prefer `vi.advanceTimersByTimeAsync()` when promises may flush.
- Reset stateful modules in `beforeEach`; scheduler suites use helpers such as `poll._resetForTest()` and `facade._resetForceTestState()`.
- Dynamic import tests use `vi.resetModules()` before `await import(...)`.
- Test `validateSender()` with accepted `file://` senders and rejected remote origins.
- For known-good branded fixtures, use `asTestEventId`, `asTestMeetUrl`, `asTestIsoUtc`; for validator failures, call `asEventId` / `asMeetUrl` / `asIsoUtc` directly and inspect `Result`.

## Helper policy

Prefer `tests/helpers/test-utils.ts` for new fixtures: `createMockEvent`, `createMockSettings`, `createMockIpcEvent`, `isoFromNow`, and branded wrappers. Existing per-file factories may remain when they encode local suite behavior (`makeSwiftLine`, scheduler-specific `makeEvent`).

## Commands

```bash
bun run test
bun run test:watch
bun run test:coverage
```

## Known gaps

- No integration tests spanning main + preload + renderer.
- No real EventKit/Swift execution in CI.
- No packaged Electron app smoke test.
- Auto-updater download/install/relaunch lifecycle is mocked only.
- Some scheduler title-countdown tests depend on ordering because `resetState()` swaps singleton bindings; keep file-local notes intact.
