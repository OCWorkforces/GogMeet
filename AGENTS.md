# GogMeet - AGENTS.md

**Updated:** 2026-07-27
**Branch:** develop (CA Wave 0: main/domain → main/facades)

Desktop tray app for calendar meeting reminders. **macOS** reads EventKit via a Swift helper; **Windows** uses Google Calendar API + OAuth PKCE (Google-only MVP — not EventKit multi-account parity). Lists Meet/Zoom/Calendly events, auto-opens join URLs before start, optional alert window, tray menu, and `CmdOrCtrl+Shift+M` to join the next meeting.

## STACK

| Layer | Tech |
| --- | --- |
| Runtime | Electron `^43.2.0`; all BrowserWindows sandboxed/context-isolated/no Node integration |
| Language | TypeScript `^6.0.3`; `isolatedDeclarations`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noPropertyAccessFromIndexSignature` |
| Build | Rslib for main/preload CJS; Rsbuild for three renderer entries |
| Package | Bun `>=1.3.0`, `packageManager: bun@1.3.14`; host Node floor `>=20`, CI/recommended Node `26` |
| Calendar (macOS) | Swift EventKit helper `src/main/googlemeet-events.swift`; cache under `{tmpdir}/googlemeet/` |
| Calendar (Windows) | Google OAuth PKCE + Calendar API; tokens/cache encrypted under `userData` (`calendar-auth/google.enc`, `calendar-cache.enc`) |
| Test | Vitest workspace: main / renderer / shared / scripts |
| Package build | electron-builder: mac DMG+ZIP; win NSIS+portable; `arm64` + `x64` |
| Updates/logging | `electron-updater` (packaged non-portable only), `electron-log` |

## STRUCTURE

```text
GogMeet/
├── src/main/        # Electron main: lifecycle, tray, IPC, scheduler, windows, calendar providers
│   ├── calendar/    # CalendarProvider factory, Google/Darwin/fixture, auth, url-extract
│   ├── facades/     # calendar facade, watcher, settings (main-process application surface)
│   ├── platform/    # OS helpers (isDarwin/isWin32) — not meeting-host detection
│   └── swift/       # EventKit compile/run/JSON Lines (Darwin provider only)
├── src/domain/      # pure domain (CA Wave 1+) — entities/policies; no Electron
├── src/preload/     # sandboxed context bridge exposing typed window.api
├── src/renderer/    # vanilla TS pages: popover, settings, alert
├── src/shared/      # contracts, brands, results, errors, IPC maps, pure utilities
├── tests/           # Vitest workspace; Electron mocks only in main project
├── scripts/         # dev orchestrator, icons (icns/ico), release verifiers, latest.yml merge
├── build/           # electron-builder hooks, entitlements, icon.icns / icon.ico
├── docs/            # design docs (CA plan, windows, enhancement)
├── assets/          # README screenshots
├── .github/         # PR/release workflows; see `.github/workflows/AGENTS.md`
└── .sentrux/        # architecture constraints
```

Skip generated/cache outputs: `lib/`, `dist/`, `coverage/`, `node_modules/`, `.eslintcache`, `*.tsbuildinfo`.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Runtime bootstrap | `src/main/index.ts`, `src/main/app/lifecycle.ts` | single-instance lock; settings before scheduler; `initAutoUpdater` last |
| Add IPC | `src/shared/ipc-channels.ts` → `ipc-handlers/*` → preload → renderer/tests | invoke: `typedHandle`; fire-and-forget: sender validation |
| Pure domain | `src/domain/` | entities, policies, pure services (no Electron) |
| Calendar facade | `src/main/facades/calendar.ts` | only public calendar surface for scheduler/IPC/tray |
| Calendar providers | `src/main/calendar/factory.ts`, `providers/*` | Darwin EventKit; Windows Google; fixture when unpackaged + env |
| Google OAuth / tokens | `src/main/calendar/auth/*` | PKCE loopback; `google.enc`; `GOOGLE_OAUTH_CLIENT_ID` |
| URL extraction (shared) | `src/main/calendar/url-extract.ts` | Zoom → Meet → Calendly; allowlisted |
| Swift EventKit wire | `src/main/swift/*`, `googlemeet-events.swift` | JSON Lines 9-string arrays; Darwin only |
| Calendar change watch | `facades/calendar-watcher.ts` | provider `startWatch` (EventKit sidecar) or poll-only |
| Scheduler | `scheduler/facade.ts`, `scheduler/AGENTS.md` | only public scheduler entry |
| Tray menu | `tray.ts`, `menu/meeting-menu.ts` | `setContextMenu` on setup; Windows left-click `popUpContextMenu` |
| OS vs meeting platform | `platform/os.ts` vs `utils/platform.ts` | OS predicates vs Meet/Zoom host detection |
| Window chrome | `utils/window-chrome.ts` | mac vibrancy vs Windows opaque |
| Settings Google account | `renderer/settings/index.ts` + calendar IPC disconnect/ui-state | tray-first Connect CTA on Windows |
| Packaging | `electron-builder.yml`, `build/AGENTS.md` | per-arch win NSIS/portable; mac DMG/ZIP |
| CI/release | `.github/workflows/AGENTS.md` | PR matrix mac+win; release-mac + release-win |
| Windows dogfood | `docs/windows-dogfood.md` | OAuth setup, package scripts |

## CODE MAP

| Symbol / file | Role |
| --- | --- |
| `src/main/index.ts` | bootstrap, single-instance, popover chrome, lifecycle |
| `initializeApp()` | warmup provider, IPC, settings, tray, scheduler, watcher, power, shortcuts, auto-updater |
| `calendar/factory.ts` | fixture → Darwin EventKit → Google (non-Darwin) |
| `facades/calendar.ts` | facade + `CalendarUiState` + `calendar-status-updated` bus |
| `scheduler/facade.ts` | only external scheduler import |
| `scheduler/poll.ts` | poll; emits meetings + error status for tray |
| `tray.ts` | Tray lifecycle, icons, tooltip, menu install + Windows left-click menu |
| `events.ts` | `meeting-list-updated`, `calendar-status-updated`, power |
| `system/auto-updater.ts` | packaged non-portable only (`isPortableInstall`) |

## CONVENTIONS

- TypeScript imports use `.js` specifiers; type-only imports use `import type`.
- Bun is the primary package manager; host Node 26 for validation/icon generation/release helpers.
- No barrels. Scheduler public surface is `scheduler/facade.ts` only.
- Prefer `platform/os.ts` over raw `process.platform` for OS branches.
- Never static-import `swift/*` outside `calendar/providers/darwin-eventkit.ts` and `swift/**`.
- Branded values created only at trust boundaries.
- `CalendarResult` narrows via `result.kind === "ok"` / `isCalendarOk()`.
- Meeting URL allowlisting at egress only (`buildMeetUrl`, `openMeetingUrl`, `APP_OPEN_EXTERNAL`).
- Tray menu must be installed with `setContextMenu()` before first activation; Windows also `popUpContextMenu` on left-click.
- User strings in renderer HTML go through `escapeHtml()`.

## ANTI-PATTERNS

- `as any`, `@ts-ignore`, empty catches, raw-string thrown errors.
- Raw `ipcMain.handle` / `webContents.send` outside `typedHandle` / `typedSend`.
- Importing `swift/*` from facades, lifecycle, Google provider, or settings.
- Auto-opening OAuth on Windows lifecycle (use tray/Settings Connect only).
- Dual-arch single NSIS invocation for official Windows artifacts (build `--x64` and `--arm64` separately).
- Overwriting `latest.yml` with sequential publish without `merge:windows-latest-yml`.
- Hand-editing generated icons; regenerate via `scripts/generate-calendar-tray-icons.mjs`.
- Claiming EventKit multi-source parity for Windows Google MVP.
| Join a meeting | `src/main/utils/join-meeting.ts`, `utils/meet-url.ts`, menu/shortcuts/IPC | all paths use `joinMeetingById` → `buildMeetUrl` + `openMeetingUrl` + `cancelPendingBrowserOpen` |
| Settings/alert UI | `src/renderer/settings/index.ts`, `src/renderer/alert/index.ts` | settings schema v2; alert Join via EventId (no meetUrl in payload) |
| `src/shared/ipc-channels.ts` | contract | high | channel names, request/response maps (includes `APP_JOIN_MEETING`), push maps |
| `facades/calendar-status.ts` | cache | tray menu | last poll ok/err status for menu error rows |
| `utils/join-meeting.ts` | join hub | menu/hotkey/IPC | `joinMeetingById` + mark opened |
| `utils/log.ts` | logging | bootstrap | electron-log scopes for main diagnostics |
| `renderer/settings/index.ts` | page entry | settings | schema v2 toggles, auto-save |
- Meeting hostnames live in `src/shared/meet-url-allowlist.ts`. Parser ingress uses `validateMeetUrl()`; egress uses `openMeetingUrl()` / `joinMeetingById`.
- All user join paths (menu, hotkey, renderer, alert) must call `joinMeetingById` so auto-open is suppressed after a successful open.
- Meeting URL egress through direct `shell.openExternal()`; use `openMeetingUrl()` / `joinMeetingById`, or a documented exact allowlist for non-meeting URLs (`openSystemSettings`).

## COMMANDS

```bash
bun install
bun run dev
bun run build
bun run typecheck
bun run test
bun run lint
bun run format:check
bun run validate:node          # host Node >=26 + icon generator (mac for icns)
bun run package:mac            # DMG/ZIP arm64+x64
bun run package:win:x64        # NSIS + portable x64
bun run package:win:arm64      # NSIS + portable arm64
bun run merge:windows-latest-yml
bun run verify:macos-release
bun run verify:windows-release
bun run clean
```

## CI / PACKAGING

- **PR:** matrix `macos-latest` + `windows-latest` — lint, format, typecheck, build, test:coverage; `validate-node` mac-only (icon drift including `icon.ico` / win tray PNGs).
- **Release (`v*` tags):** parallel `release-mac` (Apple secrets required) and `release-win` (optional `WIN_CSC_*`; unsigned dogfood if absent). Windows: sequential arch builds → merge `latest.yml` → verify → upload.
- **electron-builder:** mac DMG/ZIP; win NSIS (`perMachine: false`) + portable; global `artifactName` with `${arch}`; portable uses `*-portable` suffix.
- **Secrets:** Apple CSC/notarization for mac; optional `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`; `GOOGLE_OAUTH_CLIENT_ID` for Windows Connect in packaged builds.

## NOTES

- macOS: EventKit permission / AppleScript probes; lifecycle may auto-request when not-determined. Windows: never auto-OAuth.
- Swift protocol: JSON Lines 9 strings; exit codes 0/2/3/4; cache mode `0o700` under `os.tmpdir()/googlemeet`.
- Windows offline: encrypted event cache; network failure may serve last sync.
- Auto-open: non-all-day, 1–5 min before start; alert ~60s before open; dismiss cancels open.
- Poll: 2 min AC / 4 min battery; `forcePoll` coalesces within 10s.
- Supported hosts: Meet, Zoom (`.zoom.us`), Calendly. New wrappers: Swift extract + TS url-extract + main/preload allowlists + tests.
- Design / dogfood: `docs/windows-platform-support-design.md`, `docs/windows-dogfood.md`.
- Beta workflow (`.github/workflows/beta-release.yml`): push to `develop` publishes a GitHub **pre-release** with auto-incremented tag `v${version}-beta-N` and DMG/ZIP assets; signing/notarize when secrets are present, otherwise unsigned package.
- Official release workflow: on `main`, ensure `v$(package.json.version)` exists and **package/upload in the same run** (GITHUB_TOKEN tag pushes do not re-trigger workflows). Also runs for non-beta `v*` tags. Signed+notarized when all Apple secrets are set; otherwise unsigned fallback (skip verifier). Upload DMG/ZIP + `SHA256SUMS.txt` as Latest.
- Auto-open applies to non-all-day future meetings when `autoOpenEnabled`; open offset is 0–10 minutes before start; Google Meet gets `authuser`, Zoom gets `uname` when email exists. Manual joins go through `joinMeetingById` and mark the event opened.
- Develop beta tags: `vX.Y.Z-beta-N` (see `.github/workflows/beta-release.yml`). Official tags: exact `v${package.json.version}` from `main`.
