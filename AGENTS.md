# GogMeet - AGENTS.md

**Updated:** 2026-07-27
**Branch:** refactoring-codebase

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
| Test | Vitest workspace: domain / application / main / renderer / shared / scripts |
| Package build | electron-builder: mac DMG+ZIP; win NSIS+portable; `arm64` + `x64` |
| Updates/logging | `electron-updater` (packaged non-portable only), `electron-log` |

## STRUCTURE

```text
GogMeet/
├── src/domain/      # pure domain: entities, policies, services (no Electron)
├── src/shared/      # IPC maps + thin cross-process DTOs (imports domain types)
├── src/main/
│   ├── composition/ # createAppGraph, bindComposition
│   ├── application/ # ports + use cases
│   ├── infrastructure/ # JsonSettingsStore, ShellMeetingOpener
│   ├── facades/     # calendar, watcher, settings (bind defaults; main surface)
│   ├── calendar/    # CalendarProvider factory + Darwin/Google/fixture
│   ├── scheduler/   # facade + planSchedule (pure) + interpret
│   ├── ipc-handlers/# typed IPC (receives AppGraph)
│   ├── menu/, tray, system/, windows/, utils/, platform/, swift/
│   └── app/         # lifecycle, ipc registrar
├── src/preload/
├── src/renderer/
├── tests/
└── docs/            # design docs (CA plan, windows, enhancement)
```

Skip generated/cache outputs: `lib/`, `dist/`, `coverage/`, `node_modules/`, `.eslintcache`, `*.tsbuildinfo`.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Runtime bootstrap | `src/main/index.ts`, `app/lifecycle.ts` | `createAppGraph()` first; settings before scheduler |
| Composition root | `composition/app-graph.ts` | typed surfaces for calendar/settings/join/opener/scheduler/watcher |
| Add IPC | `shared/ipc-channels.ts` → `ipc-handlers/*` (graph) → preload → renderer | `typedHandle` / sender validation |
| Pure domain | `src/domain/` | entities, policies, services (no Electron) |
| Calendar facade | `facades/calendar.ts` | use cases + CalendarPort; **no** `swift/*` or `calendar/auth/*` |
| Calendar providers | `calendar/factory.ts`, `providers/*` | Darwin EventKit; Windows Google; fixture |
| Google OAuth / tokens | `calendar/auth/*` | PKCE loopback; only from Google provider |
| URL extract / buildMeetUrl | `domain/services/url-extract.ts`, `build-meet-url.ts` | pure |
| Open meeting URL | `infrastructure/electron/shell-meeting-opener.ts` | allowlisted egress |
| Settings store | `infrastructure/settings/json-settings-store.ts` | FS under userData |
| Scheduler public API | `scheduler/facade.ts` | external import only |
| Schedule decisions | `scheduler/core/plan-schedule.ts` | pure; interpret in adapters |
| Calendar watch | `facades/calendar-watcher.ts` | provider `startWatch` / `reviveWatch` |
| Tray menu | `tray.ts`, `menu/meeting-menu.ts` | tray takes AppGraph; menu via callbacks |
| OS vs meeting host | `platform/os.ts` vs `domain/services/platform.ts` | |
| Packaging / CI | `electron-builder.yml`, `.github/workflows/AGENTS.md` | |

## CODE MAP

| Symbol / file | Role |
| --- | --- |
| `createAppGraph()` | composition root for main drivers |
| `initializeApp()` | warmup, IPC, settings, tray, scheduler, watcher, power, shortcuts, auto-updater |
| `facades/calendar.ts` | calendar use cases + UI state bus |
| `scheduler/facade.ts` | only external scheduler import |
| `scheduler/core/plan-schedule.ts` | pure schedule plan |
| `domain/services/build-meet-url.ts` | pure join URL with identity params |
| `joinMeetingById` / `graph.join.byId` | join hub + suppress auto-open |

## CONVENTIONS

- TypeScript imports use `.js` specifiers; type-only imports use `import type`.
- Bun is the primary package manager; host Node 26 for validation/icon generation/release helpers.
- No barrels. Scheduler public surface is `scheduler/facade.ts` only (outside `scheduler/`).
- Prefer `platform/os.ts` over raw `process.platform` for OS branches.
- Never static-import `swift/*` outside `calendar/providers/darwin-eventkit.ts` and `swift/**`.
- Facades must not import `swift/*` or `calendar/auth/*`.
- Branded values created only at trust boundaries.
- `CalendarResult` narrows via `result.kind === "ok"` / `isCalendarOk()`.
- Meeting URL allowlisting at egress only (`openMeetingUrl` / ShellMeetingOpener / `joinMeetingById`).
- All user join paths call `joinMeetingById` / `graph.join.byId`.
- Tray menu: `setContextMenu()` before first activation; Windows left-click `popUpContextMenu`.
- User strings in renderer HTML go through `escapeHtml()`.

## ANTI-PATTERNS

- `as any`, `@ts-ignore`, empty catches, raw-string thrown errors.
- Raw `ipcMain.handle` / `webContents.send` outside `typedHandle` / `typedSend`.
- Importing `swift/*` from facades, lifecycle, Google provider, or settings.
- Auto-opening OAuth on Windows lifecycle (use tray/Settings Connect only).
- Dual-arch single NSIS invocation for official Windows artifacts.
- Overwriting `latest.yml` without `merge:windows-latest-yml`.
- Permanent re-export / `@deprecated` shims after callers retarget.
- Claiming EventKit multi-source parity for Windows Google MVP.

## COMMANDS

```bash
bun install
bun run dev
bun run build
bun run typecheck
bun run test
bun run lint
bun run format:check
bun run validate:node
bun run package:mac
bun run package:win:x64
bun run package:win:arm64
bun run clean
```
