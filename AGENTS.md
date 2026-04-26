# GogMeet — Project Knowledge Base

**Generated:** 2026-04-26
**Commit:** 4728d4e
**Branch:** develop

## OVERVIEW

macOS tray-only Electron app for Google Meet calendar reminders. Fetches events via Swift EventKit from macOS Calendar, auto-opens meetings in browser 1 min before start, displays upcoming meetings in a native popover UI. Supports full-screen meeting alerts and auto-updates.

| Layer     | Tech                                      |
| --------- | ----------------------------------------- |
| Runtime   | Bun 1.3.11+ / Node.js 20.0.0+             |
| Framework | Electron 41                               |
| Build     | Rslib (main/preload) + Rsbuild (renderer) |
| Package   | Bun                                       |
| Test      | Vitest 4 (workspace)                      |

## STRUCTURE

```
src/
├── main/             # Electron main process (Node.js)
│   ├── index.ts      # App bootstrap, BrowserWindow factory
│   ├── lifecycle.ts  # Subsystem init/shutdown orchestration
│   ├── calendar.ts   # Swift EventKit calendar integration
│   ├── tray.ts       # System tray icon + menu + meeting context menu
│   ├── scheduler/    # Auto-launch browser before meetings (9 files)
│   ├── ipc-handlers/ # IPC handler implementations (6 files)
│   ├── swift/         # Swift binary management + event parsing
│   ├── menu/          # Tray context menu
│   └── utils/         # Main process utilities
├── renderer/         # UI (web context, vanilla TS)
│   ├── index.ts      # Main popover UI
│   ├── events/       # Event handling delegation
│   ├── rendering/    # UI rendering
│   ├── settings/     # Settings window (separate entry)
│   ├── alert/        # Full-screen meeting alert (separate entry)
│   └── styles/       # CSS reset + popover styles
├── preload/          # Context bridge (sandbox)
├── shared/           # Types, brands, results shared across processes
│   ├── alert.ts     # AlertPayload for alert:show push
│   ├── brand.ts     # Branded types (EventId, MeetUrl, IsoUtc)
│   ├── app-state.ts # AppState extracted from renderer
│   └── result.ts    # Result<T,E> for fallible ops
└── assets/           # Tray icons (light/dark/template, 1x/2x)
```

## WHERE TO LOOK

| Task                  | Location                                      | Notes                                   |
| --------------------- | --------------------------------------------- | --------------------------------------- |
| Add IPC channel       | `src/shared/ipc-channels.ts` → `IPC_CHANNELS` | Single source of truth                  |
| Implement IPC handler | `src/main/ipc-handlers/`                      | Add file, register with `typedHandle()` |
| Expose to renderer    | `src/preload/index.ts`                        | Add to `api` object                     |
| Calendar logic        | `src/main/calendar.ts`                        | Delegates to `swift/`                   |
| Swift binary          | `src/main/swift/binary-manager.ts`            | Hash-based cache, `runSwiftHelper()`    |
| Scheduler             | `src/main/scheduler/index.ts`                 | Central timer hub                       |
| Scheduler lifecycle + forcePoll | `src/main/scheduler/poll.ts`            | Start/stop/restart/forcePoll (10s coalesce) |
| Scheduler state       | `src/main/scheduler/state.ts`                 | Getter-only API over Maps/Sets/scalars |
| Scheduler public API  | `src/main/scheduler/facade.ts`                | Single entry point for external consumers |
| Tray title            | `src/main/tray.ts:119`                        | `updateTrayTitle()`                     |
| Alert window          | `src/main/alert-window.ts`                    | Full-screen overlay                     |
| Settings window       | `src/main/settings-window.ts`                 | Singleton, shows in Dock                |
| Global shortcut       | `src/main/shortcuts.ts`                       | Cmd+Shift+M → join next                 |
| Alert payload contract | `src/shared/alert.ts` | AlertPayload for alert:show push |
| Branded types | `src/shared/brand.ts` | EventId, MeetUrl, IsoUtc with validators |
| Shared AppState | `src/shared/app-state.ts` | Extracted from renderer |
| Type-safe push | `src/main/ipc-handlers/shared.ts` | `typedSend()` for main→renderer |
| Swift type guards | `src/main/swift/guards.ts` | Runtime type narrowing |
| Force-poll IPC      | `src/main/ipc-handlers/scheduler.ts`          | `scheduler:force-poll` fire-and-forget → `forcePoll()` |
| Build config          | `rslib.config.ts`, `rsbuild.config.ts`        | Separate for each process               |

## CONVENTIONS

- **ESM source → CJS output**: Source `.ts` with ESM, outputs `.cjs` for Electron
- **Import paths**: Always `.js` extension (`from './types.js'`) even for `.ts` source
- **Import types separately**: `import type { X }` enforced by `verbatimModuleSyntax`
- **Type-safe IPC**: `typedHandle()` in ipc-handlers/, `IpcResponse<T>` in preload
- **No UI framework**: Vanilla TS with `innerHTML` string templates
- **No barrel files**: All imports use direct paths
- **Settings window**: Shows in Dock when open, hides when closed (tray-only otherwise)
- **Alert window**: Full-screen overlay, singleton, Escape to dismiss
- **macOS only**: Swift EventKit, dock hiding — no cross-platform
- **Scheduler imports**: `scheduler/facade.ts` is the sole public interface; external consumers must import from `facade.js`, not `index.js`
- **Scheduler state access**: All state (Maps, Sets, scalars) accessed via typed getter functions (`getTimers()`, `getActiveTitleEventId()`, etc.) — no direct Proxy views or module-level `let` exports
- **Renderer string building**: Use `parts.push()` + `.join('')` pattern for meeting list rendering — not `html +=` concatenation
- **Discriminated unions**: CalendarResult uses `kind: "ok"|"err"` tag, narrow with `isCalendarOk()`
- **Branded types**: EventId, MeetUrl, IsoUtc — validated at trust boundaries (parser, URL validation)
- **typedSend()**: All main→renderer push uses `typedSend()` with `isDestroyed()` guard, no raw `webContents.send()`
- **as const satisfies**: Config objects use `as const satisfies T` for compile-time validation
- **Result type**: `Result<T,E>` used for fallible operations (settings load, brand validation)
- **Error handling**: `tryRun`/`tryRunAsync` wrappers in lifecycle.ts, shows `dialog.showErrorBox()` on fatal init failure
- **Settings eager-load**: `loadSettings()` called during lifecycle init before `startScheduler()` — guarantees cache warm before scheduler polls

## ANTI-PATTERNS (THIS PROJECT)

```typescript
// rslib.config.preload.ts — electron must never be bundled in preload
// rslib.config.ts — electron external appended AFTER ElectronTargetPlugin
```

- Electron module MUST be external in preload builds
- Electron external MUST be appended AFTER `ElectronTargetPlugin` sets its own externals
- Never suppress type errors (`as any`, `@ts-ignore`, `@ts-expect-error`) — zero in source
- Never bypass `validateSender()` in IPC handlers
- Never use `fs.readFileSync()` for tray icons — `nativeImage.createFromPath()` required
- Never bundle the Swift source file inside ASAR — `swiftc` cannot read from ASAR archives
- Never open arbitrary URLs via `shell.openExternal()` — validate against `MEET_URL_ALLOWLIST`
- Never insert user content via `innerHTML` without `escapeHtml()` — XSS protection
- All BrowserWindows must have `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
- `SWIFT_SRC_DEV` path uses `../..` (2 levels up from bundled `lib/main/`), NOT `../../..`
- Never use `.startsWith()` for URL validation, use `new URL().hostname` exact match against `MEET_URL_ALLOWLIST`
- Never use raw `webContents.send()` — use `typedSend()` from shared.ts
- Never use `"error" in result` duck-typing — use `isCalendarOk()` or `result.kind === "ok"`
- Never assign raw strings to branded types (EventId, MeetUrl, IsoUtc) — use validators
- Never call `allowSleep()` without a matching `preventSleep()`, ref-counted in power.ts

## BUILD SYSTEM

Three-process build:

1. **Main** (`rslib.config.ts`): `electron-main` target → `lib/main/index.cjs`
2. **Preload** (`rslib.config.preload.ts`): `electron-preload` target → `lib/preload/index.cjs`
3. **Renderer** (`rsbuild.config.ts`): Three environments (`main` + `settings` + `alert`) → `lib/renderer/`

Production: SWC minifier with `drop_console: true`, tree-shaking, no source maps.

## COMMANDS

```bash
bun run dev          # Start dev (watch + electron)
bun run build        # Build all (main + preload + renderer)
bun run package      # Build + create DMG/ZIP (macOS arm64 + x64)
bun run typecheck    # TypeScript check (tsc -b)
bun run test         # Run Vitest tests (677 tests, main + renderer workspaces)
bun run test:watch   # Watch mode
bun run clean        # Remove lib/ dist/
rm -rf /tmp/googlemeet   # Force Swift binary recompile
```

## NOTES

- **Calendar permission**: First access triggers macOS EventKit permission dialog
- **Swift binary cache**: Compiled to OS temp dir (`/tmp/googlemeet/`) on first run; hash-based recompilation
- **Swift output format**: 9 tab-delimited fields: uid\ttitle\tstartISO\tendISO\turl\tcalName\tallDay\temail\tnotes
- **Auto-open**: Browser opens 1-5 min before each non-all-day meeting; `?authuser=email` appended
- **Full-screen alert**: Fires at `openBeforeMinutes + 1` min before meeting (suppresses browser auto-open)
- **Scheduler polling**: 2 min on AC, 4 min on battery (independent of renderer's 5-min UI refresh); refresh button and tray click fire `forcePoll()` for immediate re-fetch
- **Scheduler state**: 8 timer Maps, 2 fired-event Sets, 1 cancelledEvents Set, 5 scalars (activeTitleEventId, activeInMeetingEventId, consecutiveErrors, titleDirty, inMeetingDirty) — all in `SchedulerState` object, accessed via getter functions
- **replaceState safety**: `replaceState()` clears old timer handles via `clearSchedulerResources()` and preserves `win`/`onTrayTitleUpdate`/`powerCallbacks` from old state
- **ConsecutiveErrors cap**: `incrementConsecutiveErrors()` caps at `MAX_CONSECUTIVE_ERRORS_CAP` (4) to prevent unbounded growth after error handler fires
- **Window hide on blur**: Popover hides when focus lost (dev mode exempt)
- **Circular dep fixed**: `scheduler/index.ts` no longer re-exports from `poll.ts`, all external imports go through `scheduler/facade.ts`
- **Scheduler pollEpoch**: Race condition guard, stale callbacks from previous scheduler instances are silently discarded
- **forcePoll coalesce**: `forcePoll()` skips if a poll completed within the last 10s (`FORCE_POLL_COALESCE_MS`); prevents thrash from rapid tray clicks or wake storms
- **Swift exit codes**: 0=success, 2=permission denied, 3=no calendars, 4=error
- **Binary cache**: 0o700 mode for security; 5 retries with exponential backoff (1s to 30s) on compile failure
- **Sandbox**: `app.enableSandbox()` called before `whenReady()`, all BrowserWindows use `sandbox: true`
- **Alert coalescing**: `alert-window.ts` uses `isAlertShowing` queue, coalesces duplicate uids on rapid `showAlert()` calls
- **Branded types**: EventId, MeetUrl, IsoUtc — phantom brand via unique symbol, string-compatible for read, validated at parser/URL boundaries
- **Discriminated CalendarResult**: `kind: "ok"|"err"` tag enables exhaustive narrowing
- **ParseResult**: `parseEvents()` returns `{events, diagnostics[]}` — diagnostics logged via console.warn
- **typedSend()**: Wraps `webContents.send()` with `isDestroyed()` check and PushChannelMap types
- **AlertPayload**: Unified in shared/alert.ts — single type for alert:show across all 3 processes
- **Test utilities**: Shared factory functions in `tests/helpers/test-utils.ts` — `createMockEvent()`, `createMockSettings()`, `createMockIpcEvent()`, `isoFromNow()`
- **IPC channels**: 12 total (7 invoke, 2 fire-and-forget, 3 push main→renderer)
