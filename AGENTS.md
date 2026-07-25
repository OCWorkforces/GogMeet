# GogMeet - AGENTS.md

**Generated:** 2026-07-02
**Commit:** 6dc9a78
**Branch:** develop

macOS tray app for Calendar meeting reminders. Reads EventKit through a Swift helper, lists upcoming Google Meet/Zoom/Calendly events, auto-opens meeting URLs before start, shows optional full-screen alerts, and exposes `Cmd+Shift+M` to join the next meeting.

## STACK

| Layer | Tech |
| --- | --- |
| Runtime | Electron `^43.0.0`; all BrowserWindows sandboxed/context-isolated/no Node integration |
| Language | TypeScript `^6.0.3`; `isolatedDeclarations`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noPropertyAccessFromIndexSignature` |
| Build | Rslib `^0.23.1` for main/preload CJS; Rsbuild `^2.1.2` for three renderer entries |
| Package | Bun `>=1.3.0`, `packageManager: bun@1.3.14`; host Node floor `>=20`, CI/recommended Node `26`; Electron runtime embeds its own Node independent of host Node |
| Calendar | Swift EventKit helper source at `src/main/googlemeet-events.swift`, runtime cache under `/tmp/googlemeet/` |
| Test | Vitest `^4.1.9` workspace: main / renderer / shared / scripts |
| Package build | electron-builder `^26.15.3`; DMG + ZIP for `arm64` and `x64` |
| Updates/logging | `electron-updater` `^6.8.9`, `electron-log` `^5.4.4` |

Tooling note: TypeScript LSP symbols are unavailable (`lsp_symbols` returned `Method not found`; TS server missing), but codegraph is available. CODE MAP refs below combine codegraph blast-radius data with `rg`-derived hints.

## STRUCTURE

```text
GogMeet/
├── src/main/        # Electron main: lifecycle, tray, IPC, scheduler, windows, EventKit/Swift
├── src/preload/     # sandboxed context bridge exposing typed window.api
├── src/renderer/    # vanilla TS pages: popover, settings, alert
├── src/shared/      # side-effect-free contracts, brands, results, errors, pure utilities
├── tests/           # Vitest workspace; Electron mocks only in main project
├── scripts/         # Bun dev orchestrator, icon generation, Node 26 validation
├── build/           # electron-builder hooks, entitlements, generated app icon
├── assets/          # README screenshots
├── .github/         # PR/release workflows; see `.github/workflows/AGENTS.md`
└── .sentrux/        # architecture constraints: process boundaries, scheduler facade, state internals
```

Skip generated/cache outputs: `lib/`, `dist/`, `coverage/`, `node_modules/`, `.eslintcache`, `*.tsbuildinfo`, `.cocoindex_code/`, `.omo/`, `.mnemonics/`.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Runtime bootstrap | `src/main/index.ts`, `src/main/app/lifecycle.ts` | lifecycle order matters; settings load before scheduler |
| Add IPC | `src/shared/ipc-channels.ts` -> `src/main/ipc-handlers/*` -> `src/preload/index.ts` -> renderer/tests | invoke uses `typedHandle`; fire-and-forget uses sender validation |
| Calendar fetch/parser | `src/main/domain/calendar.ts`, `src/main/swift/*`, `src/main/googlemeet-events.swift` | Swift output is JSON Lines arrays of 9 strings |
| Calendar change watch | `src/main/domain/calendar-watcher.ts`, `src/main/swift/calendar-watch-sidecar.ts` | Swift `--watch` emits `CHANGED`; domain calls `forcePoll()` |
| Scheduler behavior | `src/main/scheduler/facade.ts`, `src/main/scheduler/AGENTS.md` | facade is the only public scheduler entry |
| Scheduler state | `src/main/scheduler/state/AGENTS.md` | state files are internal-only |
| Tray native menu | `src/main/tray.ts`, `src/main/menu/meeting-menu.ts`, `tests/main/tray.test.ts` | install with `tray.setContextMenu()` during setup; refresh on `meeting-list-updated` |
| URL allowlist/egress | `src/main/utils/url-validation.ts`, `src/main/utils/meet-url.ts`, `src/preload/index.ts` | preload mirror is intentional; main is authoritative |
| BrowserWindow security/loading | `src/main/utils/browser-window.ts`, `src/main/windows/*` | dev/prod renderer loading belongs here |
| Renderer popover | `src/renderer/index.ts`, `src/renderer/rendering/body.ts`, `src/renderer/lib/apply-events-push.ts` | push signature gates DOM re-render |
| Settings/alert UI | `src/renderer/settings/index.ts`, `src/renderer/alert/index.ts` | settings saves through IPC; alert cannot open URLs |
| Tests | `vitest.workspace.ts`, `tests/AGENTS.md` | main=node+Electron mock; renderer=jsdom; shared/scripts=node |
| Packaging/release | `electron-builder.yml`, `build/AGENTS.md`, `.github/workflows/AGENTS.md` | Swift source must stay unpacked from ASAR; release workflow double-builds today |

## CODE MAP

| Symbol / file | Type | Refs | Role |
| --- | --- | --- | --- |
| `src/main/index.ts` | entry | runtime | creates tray popover, enables sandbox, calls lifecycle |
| `initializeApp()` | function | startup hub | wires Swift prewarm, IPC, settings, tray, scheduler, watcher, power, shortcuts |
| `src/main/app/ipc.ts` | registrar | IPC hub | registers calendar/settings/app/window/alert/scheduler handlers |
| `src/shared/ipc-channels.ts` | contract | high, rg-derived | channel names, request/response maps, push payload maps |
| `src/preload/index.ts` | bridge | runtime | exposes `window.api`; brands URL/height before IPC |
| `scheduler/facade.ts` | facade | 8 direct prod importers, rg-derived | `startScheduler`, `forcePoll`, restart, injected callbacks |
| `scheduler/poll.ts` | internal | facade-called | fetches calendar, schedules timers, hash-gates renderer push |
| `scheduler/state/*` | internal state | internal only | timer maps, display state, poll epoch, runtime callbacks |
| `domain/calendar.ts` | boundary | IPC/scheduler | runs Swift helper and returns `CalendarResult` |
| `swift/binary-manager.ts` | boundary | calendar | cache/compile/run helper, retry once after exec failure |
| `utils/browser-window.ts` | facade | 4 direct prod importers, rg-derived | secure web prefs, preload path, content loading, CSP |
| `events.ts` | bus | 3 direct prod importers, rg-derived | scheduler/power -> tray decoupling |
| `tray.ts` | status item | runtime | creates native Tray, pre-installs context menu, refreshes menu cache from `meeting-list-updated` |
| `renderer/index.ts` | page entry | Rsbuild main | popover state machine, push handling, resize IPC |
| `renderer/settings/index.ts` | page entry | Rsbuild settings | settings form, auto-save, save indicators |
| `renderer/alert/index.ts` | page entry | Rsbuild alert | alert render/dismiss, Escape-only keyboard dismiss |

## CONVENTIONS

- TypeScript imports use `.js` specifiers for `.ts` source; type-only imports use `import type`.
- Bun is the primary runner/package manager; host Node 26 is only for validation/icon-generation/release tag helper paths.
- No barrels. `scheduler/index.ts` is an internal scheduling hub, not the public surface; external consumers use `scheduler/facade.ts`.
- `as const` on lookup maps/config. Avoid `satisfies`, `enum`, and `namespace` under `erasableSyntaxOnly` / `isolatedDeclarations`.
- Index-signature objects require bracket notation: `obj["key"]`.
- Branded values (`EventId`, `MeetUrl`, `IsoUtc`, `WindowHeight`) are created at trust boundaries only.
- `CalendarResult` narrows via `result.kind === "ok"` or `isCalendarOk()`. Generic `Result` narrows via `result.ok`.
- Renderer HTML uses string templates/full rerender; any user-controlled string going into `innerHTML` passes through `escapeHtml()`.
- Swift parsing is structural; meeting host allowlisting happens at egress (`buildMeetUrl`, `openMeetingUrl`, `APP_OPEN_EXTERNAL`).
- Native tray menus are installed ahead of first activation with `tray.setContextMenu()`; click handlers may trigger refresh work such as `forcePoll()`, but must not be the only place the menu is built.

## ANTI-PATTERNS

- `as any`, `@ts-ignore`, `@ts-expect-error`, empty catches, or raw-string thrown errors.
- Raw `ipcMain.handle()` outside `typedHandle()` or raw `webContents.send()` outside `typedSend()`.
- Bypassing `validateSender()` / `validateOnSender()` for renderer-originated IPC.
- Trusting preload-branded payloads in main fire-and-forget handlers; revalidate/rebrand at the main boundary.
- Meeting URL validation with `.startsWith()`; parse with `new URL()` and exact/suffix host allowlists.
- Meeting URL egress through direct `shell.openExternal()`; use `openMeetingUrl()` or a documented exact allowlist/guard for non-meeting URLs.
- Bundling Electron into preload; `electron` and `electron/*` stay external in `rslib.config.preload.ts`.
- Bundling Swift source only inside ASAR; `swiftc` needs `asarUnpack`.
- Reaching into `scheduler/poll.ts`, `scheduler/index.ts`, or `scheduler/state/*` from outside scheduler.
- Building the tray context menu only inside `tray.on("click")`; macOS needs an installed menu before the first status-item activation.
- `allowSleep()` without a matching prior `preventSleep()`; power refs are reference-counted.
- Hand-editing generated tray/app icon assets; regenerate through `scripts/generate-calendar-tray-icons.mjs`.

## COMMANDS

```bash
bun install
bun run dev              # Bun orchestrator: Rslib watches + Rsbuild dev server + Electron
bun run build            # build main, preload, renderer
bun run build:main       # rslib build -c rslib.config.ts
bun run build:preload    # rslib build -c rslib.config.preload.ts
bun run build:renderer   # rsbuild build
bun run typecheck        # tsc -b
bun run test             # vitest run -c vitest.workspace.ts
bun run test:coverage    # V8 coverage across workspace projects
bun run lint             # eslint src/ --cache
bun run format:check     # prettier --check 'src/**/*.{ts,css}'
bun run validate:node    # require host Node >=26, then run icon generator
bun run package:dir      # build + unpacked macOS app
bun run package          # build + DMG/ZIP via electron-builder
bun run clean            # remove lib/ and dist/
```

## CI / PACKAGING

- PR workflow (`.github/workflows/pr-check.yml`): macOS, Bun install, `lint`, `format:check`, `typecheck`, `build`, `test:coverage`, related tests for changed `src/**/*.ts`; separate Node 26 job runs `validate:node` and fails on icon drift (`git diff --exit-code`).
- Release workflow: on `main` may create `v$(package.json.version)` when missing; tag `v*` runs require `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, then `bun run package` once, `verify:macos-release`, and upload DMG/ZIP + `SHA256SUMS.txt`.
- `electron-builder.yml`: output `dist/`, macOS 11+, arm64+x64 DMG/ZIP, `mergeASARs: false`, `hardenedRuntime: true`, `mac.notarize: false` (custom afterSign owns notarize), `gatekeeperAssess: false`, DMG `sign: false`, GitHub `publish` for electron-updater.
- Packaging hooks: `afterPack: build/after-pack.cjs` (optimize); `afterSign: build/notarize.cjs` (notarytool + staple + validate). Env prefers `APPLE_APP_SPECIFIC_PASSWORD`.

## NOTES

- EventKit permission is requested on first access; lifecycle invalidates the cached permission state on resume/unlock before scheduler restart.
- Swift helper cache: `/tmp/googlemeet/googlemeet-events` plus `/tmp/googlemeet/source.hash`, mode `0o700`, hash-keyed.
- Swift one-shot exit codes: `0` success, `2` permission denied, `3` no calendars, `4` runtime/helper error. Production `runSwiftHelper` classifies 2/3/4 via `classifySwiftError` without recompile; `CalendarResultErr.code` carries the structured code.
- Swift output protocol: one JSON array line of exactly nine strings ordered as `uid`, `title`, `startISO`, `endISO`, `url`, `calName`, `allDay`, `email`, `notes`.
- Official releases are created only from `v${package.json.version}` tags. The tag workflow requires nonempty `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`; local `bun run package` remains allowed without them.
- Official release verification mounts DMGs and extracts ZIPs, then validates each contained app. The app is signed, notarized, and stapled; a DMG and ZIP are containers and must not be described as stapled/notarized themselves.
- Auto-open applies to non-all-day future meetings when `autoOpenEnabled`; open offset is 0–10 minutes before start; Google Meet gets `authuser`, Zoom gets `uname` when email exists. Manual joins go through `joinMeetingById` and mark the event opened.
- Full-screen alert fires `alertLeadSeconds` (default 60s) before browser auto-open; Join uses EventId IPC; dismissing cancels that event's pending browser open.
- Scheduler polling: 2 min on AC, 4 min on battery; `forcePoll()` coalesces within 10s by scheduling one deferred follow-up, not by dropping every request.
- Supported extracted meeting URLs today: Google Meet, Zoom (including `.zoom.us` subdomains), and Calendly wrappers. Add new wrappers by updating Swift extraction, main/preload allowlists, and tests together.
