# src/ Directory — Source Root

## OVERVIEW

`src/` contains all application source code organized by process. Three entry points build to three destinations: `lib/main/` (CJS), `lib/preload/` (CJS), `lib/renderer/` (ESM).

## LAYERS

| Layer        | Entry                    | Output                      | Process       |
| ------------- | ------------------------ | --------------------------- | ------------- |
| `main/`      | `src/main/index.ts`      | `lib/main/index.cjs`        | Electron main |
| `preload/`   | `src/preload/index.ts`   | `lib/preload/index.cjs`     | Sandboxed context bridge |
| `renderer/`  | `src/renderer/index.ts`  | `lib/renderer/` (3 entries) | BrowserWindow web content |

## SUB-DIRECTORIES

### `main/` — Electron Main Process
See [`src/main/AGENTS.md`](./main/AGENTS.md) for full documentation. Key files:
- `index.ts` — BrowserWindow factory, lifecycle bootstrap
- `lifecycle.ts` — Subsystem init/shutdown orchestration
- `calendar.ts` — Swift EventKit delegation
- `tray.ts` — System tray icon, context menu, countdown title
- `scheduler/` — Auto-launch browser before meetings (facade → sole public interface)
- `swift/` — Swift binary management + event parsing
- `ipc-handlers/` — IPC handler implementations (typedHandle)

### `renderer/` — UI (Web Context, Vanilla TS)
See [`src/renderer/AGENTS.md`](./renderer/AGENTS.md) for full documentation. Three entry points:
- `index.ts` → `360×480` popover (meeting list)
- `settings/index.ts` → settings window (Dock-visible)
- `alert/index.ts` → full-screen overlay

### `preload/` — Context Bridge
`src/preload/index.ts` exposes `window.api` with typed channels:
- `calendar` — getEvents, requestPermission, permissionStatus
- `settings` — get, set
- `scheduler` — forcePoll (fire-and-forget)
- `app` — openExternal (MeetUrl branded), getVersion
- `window` — setHeight (WindowHeight branded)
- `alert` — onShowAlert push callback

### `shared/` — Types & Brands (All Processes)
`src/shared/` is the types-only layer. Import path always `.js` extension.
- `brand.ts` — EventId, MeetUrl, IsoUtc, WindowHeight with validators
- `errors.ts` — AppError discriminated union (6 variants)
- `result.ts` — Result<T,E>, AppResult<T>
- `alert.ts` — AlertPayload for alert:show push
- `app-state.ts` — AppState (extracted from renderer)
- `ipc-channels.ts` — IPC_CHANNELS as const (single source of truth)

### `assets/` — Tray Icons
`src/assets/` contains light/dark/template icon sets at 1x/2x resolutions. Loaded via `nativeImage.createFromPath()`, never `fs.readFileSync()`.

## WHERE TO LOOK

| Task                       | Location                               | Notes                                    |
| -------------------------- | -------------------------------------- | ---------------------------------------- |
| Add IPC channel           | `src/shared/ipc-channels.ts`           | Single source of truth                   |
| Implement IPC handler     | `src/main/ipc-handlers/`              | Add file, register with `typedHandle()`  |
| Expose to renderer        | `src/preload/index.ts`                | Add to `api` object                      |
| Calendar logic            | `src/main/calendar.ts`                | Delegates to `swift/`                    |
| Swift binary              | `src/main/swift/binary-manager.ts`    | Hash-based cache, `runSwiftHelper()`     |
| Scheduler                 | `src/main/scheduler/facade.ts`        | Single public entry point                |
| Scheduler lifecycle       | `src/main/scheduler/poll.ts`          | start/stop/restart/forcePoll             |
| Tray title                | `src/main/tray.ts:119`                | `updateTrayTitle()`                      |
| Alert window              | `src/main/alert-window.ts`            | Full-screen overlay, singleton           |
| Settings window           | `src/main/settings-window.ts`         | Singleton, shows in Dock                 |
| Global shortcut            | `src/main/shortcuts.ts`               | Cmd+Shift+M → join next meeting          |
| Power management          | `src/main/power.ts`                   | Ref-counted sleep prevention             |
| Error taxonomy            | `src/shared/errors.ts`                | AppError union, errFrom(), formatAppError() |
| CSP types                 | `src/main/utils/browser-window.ts`    | CSPSource, CSPDirective, CSP template    |
| Architecture rules        | `.sentrux/rules.toml`                 | Modularity, acyclicity, depth            |

## CONVENTIONS

- ESM source → CJS output: `.ts` source with `.js` imports
- `import type` enforced by `verbatimModuleSyntax`
- No barrel files — all imports use direct paths
- `typedHandle()` for IPC; `IpcResponse<T>` in preload
- `typedSend()` for main→renderer push (no raw `webContents.send()`)
- `as const` on config objects and lookup maps
- No `satisfies` — `isolatedDeclarations` requires explicit export annotations
- No enum/namespace — `erasableSyntaxOnly` enforced
- `noPropertyAccessFromIndexSignature` → bracket notation (`obj["key"]`)
- Branded types validated at trust boundaries (EventId, MeetUrl, IsoUtc)
- `isCalendarOk()` or `result.kind === "ok"` — never duck-type errors
- `replaceState().pathname` for SPA navigation

## ANTI-PATTERNS

- Never bundle Electron in preload builds
- Electron external appended AFTER `ElectronTargetPlugin` externals
- Never use `fs.readFileSync()` for tray icons
- Never open arbitrary URLs — validate against `MEETING_URL_ALLOWLIST`
- Never use `innerHTML` without `escapeHtml()` (XSS protection)
- Never use `shell.openExternal()` — use validated `openMeetingUrl()`
- Never use `.startsWith()` for URL validation — use `new URL().hostname` exact match
- Never use raw `webContents.send()` — use `typedSend()`
- Never assign raw strings to branded types — use validators
- Never use dot notation on index-signature types — use bracket notation
- Never call `allowSleep()` without a matching `preventSleep()`
- `SWIFT_SRC_DEV` path uses `../..` (2 levels up from `lib/main/`), NOT `../../..`
- Never use `as any`, `@ts-ignore`, `@ts-expect-error`
- Swift source never bundled in ASAR — `swiftc` cannot read from ASAR archives
- Never bypass `validateSender()` in IPC handlers

## BUILD

Three-process build:
- `rslib.config.ts` — Main & Preload → CJS (`lib/main/`, `lib/preload/`)
- `rsbuild.config.ts` — Renderer → ESM (`lib/renderer/`) with 3 envs
- Source `.ts` ESM, `.js` extension imports, CJS output
- Production: SWC minifier, `drop_console: true`, tree-shaking, no source maps

Packaging: `electron-builder.yml` (root-level YAML)
- DMG + ZIP for arm64 + x64, macOS 11.0+
- `asarUnpack` for Swift source
- After-pack: `build/after-pack.cjs`
- After-sign: `build/notarize.cjs` (Apple notarization)

## TESTS

vitest workspace — `bun run test`
- `tests/main/` — 30+ files, Node environment, Electron API auto-mock
- `tests/renderer/` — 6 files, jsdom environment
- `tests/shared/` — 2 files, shared utilities
- `tests/helpers/test-utils.ts` — shared factories
- See `tests/AGENTS.md` and `tests/main/AGENTS.md` for details

## COMMANDS

```bash
bun run dev          # Start dev (watch + electron)
bun run build        # Build all (main + preload + renderer)
bun run package      # Build + create DMG/ZIP (macOS arm64 + x64)
bun run typecheck    # TypeScript check (tsc -b)
bun run test         # Run Vitest tests (~745 tests)
bun run test:watch   # Watch mode
bun run clean        # Remove lib/ dist/
```

## NOTES

- Calendar permission: first access triggers macOS EventKit permission dialog
- Swift binary cache: compiled to `/tmp/googlemeet/` on first run; hash-based recompilation
- Swift output: 9 tab-delimited fields: uid\ttitle\tstartISO\tendISO\turl\tcalName\tallDay\temail\tnotes
- Auto-open: browser opens 1-5 min before non-all-day meetings; `?authuser=email` appended
- Full-screen alert: fires at `openBeforeMinutes + 1` min before meeting (suppresses browser auto-open)
- Scheduler polling: 2 min on AC, 4 min on battery; refresh button fires `forcePoll()`
- `replaceState()` clears old timer handles via `clearSchedulerResources()`, preserves `win`/`onTrayTitleUpdate`/`powerCallbacks`
- ConsecutiveErrors capped at 4 to prevent unbounded growth
- Popover hides on blur (dev mode exempt)
- `forcePoll()` coalesces: skips if poll completed within last 10s
- Swift exit codes: 0=success, 2=permission denied, 3=no calendars, 4=error
- Binary cache: 0o700 mode, 5 retries with exponential backoff (1s→30s)
- All BrowserWindows use `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
- Calendly meeting URLs (`https://calendly.com/`) are supported — browser handles 302 redirect to underlying Meet room; no redirect resolution in main process

## RECIPE: Adding a Wrapper Provider

Wrapper providers (Calendly, SavvyCal, Cal.com, etc.) proxy to underlying meeting platforms. To add support for a new wrapper:
1. **Swift regex**: Add NSRegularExpression to `googlemeet-events.swift`, ordered LAST in `findMeetUrl()` (Zoom → Meet → wrapper)
2. **TS allowlist**: Add exact hostname prefix to `MEETING_URL_ALLOWLIST` in `url-validation.ts` (no subdomain suffix unless the wrapper uses tenant subdomains like Zoom)
3. **Security tests**: Add typo-squat, userinfo, and case-variation tests to `url-validation.test.ts`
4. **Parser tests**: Add extraction test to `event-parser.test.ts`
5. **Builder tests**: Add passthrough test to `meet-url.test.ts` (wrapper URLs must NOT get `?authuser=` appended — `detectPlatform()` returns `undefined` for unknown hosts, hit by `default` branch)
6. **Doc**: Update `src/main/utils/AGENTS.md` and this recipe list

The `parseMeetUrlField` brand validator is intentionally structural-only (`asMeetUrl`, not `validateMeetUrl`). Defense-in-depth is provided by three allowlist checks at egress time (`buildMeetUrl`, `APP_OPEN_EXTERNAL` handler, `openMeetingUrl`).


- **Calendly wrapper URLs** (`https://calendly.com/`) are supported. Calendly `/events/{uuid}/google_meet` is a server-side 302 redirect to the underlying Google Meet room. The app opens the Calendly URL directly; the user's browser handles the redirect transparently. No main-process redirect resolution is performed.

### Recipe: Adding a Wrapper Provider

Wrappers (Calendly, SavvyCal, HubSpot Meetings) proxy to underlying meeting platforms via redirects or SPA embeds. Adding support requires exactly two changes:

1. **Swift regex** — Add an `NSRegularExpression` to `src/main/googlemeet-events.swift` in `findMeetUrl()`. Order: Zoom → Meet → [new wrapper] LAST. Example pattern for Calendly: `https://calendly\.com/[^\s"'<>\\]+`
2. **TS allowlist** — Add the exact hostname with `https://` prefix to `MEETING_URL_ALLOWLIST` in `src/main/utils/url-validation.ts`. Use exact hostname match (no `.example.com` suffix by default — only add suffix support if the provider requires subdomain-scoped URLs).

The three-layer defense-in-depth on the open path (parser brands liberally, `buildMeetUrl` validates, `APP_OPEN_EXTERNAL` handler validates again) means parser-side changes are additive — no existing gate behavior changes.