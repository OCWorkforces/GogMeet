# src/ — Source Root

Application source is split by Electron process and Clean Architecture layers. Keep process boundaries strict: `main/` owns Node/Electron APIs, `preload/` is the only context bridge, `renderer/` is browser-only UI, `domain/` is pure logic, and `shared/` is IPC/DTO contracts.

## Build outputs

| Source | Entry | Output | Runtime |
| --- | --- | --- | --- |
| `main/` | `src/main/index.ts` | `lib/main/index.cjs` | Electron main (CJS) |
| `preload/` | `src/preload/index.ts` | `lib/preload/index.cjs` | sandboxed preload (CJS) |
| `renderer/` | 3 entries | `lib/renderer/` | BrowserWindow pages (ESM) |
| `domain/` | imported modules | bundled into consumers | pure, no side effects |
| `shared/` | imported modules | bundled into consumers | contracts + cast side-effect when imported |

## Directory map

| Path | Role |
| --- | --- |
| `domain/` | Pure entities, policies, services. See `domain/AGENTS.md`. |
| `shared/` | IPC maps + thin DTOs + `utils/as.ts` + `escape-html` + `app-icon-aurora`. See `shared/AGENTS.md`. |
| `main/composition/` | `createAppGraph`, `bindComposition`, `createTestAppGraph`. |
| `main/application/` | Ports + use cases (no Electron). |
| `main/infrastructure/` | Driven adapters: JsonSettingsStore, ShellMeetingOpener. |
| `main/facades/` | Calendar, watcher, status, settings free-function surface + default binds. |
| `main/calendar/` | Provider factory, Darwin/Google/fixture, **google-http**, auth (OAuth + tokens + **sync tokens**), offline cache, **refresh-coordinator**. |
| `main/scheduler/` | Facade + pure `planSchedule` + interpret adapters. |
| `main/ipc-handlers/` | Typed IPC; handlers receive `AppGraph`. |
| `main/app/` | Lifecycle + IPC registrar. |
| `main/menu/`, `tray.ts`, `events.ts` | Tray menu builders + tray lifecycle (optional completed-today history); bus events `meeting-list-updated` / `calendar-status-updated` / `power-state-changed`. |
| `main/index.ts` | Single-instance bootstrap; popover BrowserWindow **360×480**. |
| `main/system/` | Power, display-horizon, shortcuts, auto-launch, auto-updater, notifications. |
| `main/windows/` | About (320×380, aurora icon), alert, settings (Dock + hide-cache) BrowserWindows. |
| `main/utils/` | CSP/window helpers, join hub, meet-url, **performance-trace**, logging. |
| `main/platform/` | OS predicates (`isDarwin` / `isWin32`). |
| `main/swift/` | EventKit helper compile/run/JSON Lines + **swift-helper-process** (Darwin leaf). |
| `preload/` | `window.api` bridge. |
| `renderer/` | popover, settings, alert UIs. |
| `assets/` | tray icons (mac 18/36 + win 16/32) via `nativeImage.createFromPath()`; `about-icon.svg` for About data: URI + Settings brand (bundled). |

## Where to change things

| Task | Files |
| --- | --- |
| Add IPC channel | `shared/ipc-channels.ts` → `main/ipc-handlers/*` → `preload/index.ts` → renderer |
| Composition / DI | `main/composition/app-graph.ts` |
| Calendar result / phases | `domain/entities/calendar-result.ts`, `calendar-ui-state.ts` |
| Calendar publication envelope | `domain/entities/calendar-publication.ts` (`publicationGeneration` + `result`) |
| Calendar facade / UI status | `main/facades/calendar.ts`, `main/events.ts` |
| Calendar backends | `main/calendar/factory.ts`, `providers/*`, `auth/*`, `google-http.ts` |
| Google incremental sync | `main/calendar/auth/google-sync-tokens.ts` + `providers/google-calendar.ts` (ADR 0002) |
| Single-flight refresh | `main/calendar/refresh-coordinator.ts` via facade `refreshCalendarPublication` |
| Meeting URL extract | `domain/services/url-extract.ts` (+ Swift `findMeetUrl`) |
| Allowlist / validate | `domain/policies/meet-url-allowlist.ts`, `domain/services/url-validation.ts` |
| buildMeetUrl / platform host | `domain/services/build-meet-url.ts`, `domain/services/platform.ts` |
| Wall-clock membership | `domain/services/meeting-time.ts` (in-progress / upcoming / completed-today / horizon) |
| Open / join meeting | `infrastructure/electron/shell-meeting-opener.ts`, `utils/join-meeting.ts` |
| Settings schema + parse | `domain/entities/settings.ts` (schema **v3**), `domain/services/settings-parse.ts` |
| Settings persistence | `infrastructure/settings/json-settings-store.ts` via `facades/settings.ts` |
| Scheduler | `main/scheduler/facade.ts` only from outside scheduler |
| Display horizon | `main/system/display-horizon.ts` (wall-clock re-filter; no automation) |
| Swift EventKit wire | `main/swift/*` (incl. `swift-helper-process.ts`), `main/googlemeet-events.swift` |
| Unchecked casts | `shared/utils/as.ts` (`.As<T>()` / free `As`) |
| Opt-in perf marks | `main/utils/performance-trace.ts` |
| OS branching | `main/platform/os.ts` |
| Window chrome | `main/utils/window-chrome.ts` (`#0d1117` dialogs), `main/windows/*` (about / settings / alert hide-reuse) |
| Brand-icon aurora | `shared/utils/app-icon-aurora.ts` | pure CSS+HTML; About inline styles; Settings inject once |
| Settings renderer | `renderer/settings/*` | schema v3 full UI; grouped lists; canvas `#0d1117`; brand aurora under title bar |
| Auto-update | `main/system/auto-updater.ts` (portable skipped) |

## src-local rules

- Use `.js` extensions in TypeScript imports; `import type` for types only.
- Main IPC: `typedHandle()` / `typedSend()` only; handlers take `AppGraph` where they need deps.
- Scheduler consumers: `scheduler/facade.js` only (or `graph.scheduler.*`).
- No static `swift/*` imports outside Darwin provider + `swift/**`.
- Facades must not import `swift/*` or `calendar/auth/*`.
- Branded values only at trust boundaries.
- Prefer free-function `As<T>(v)` in production main/preload; method `.As<T>()` is fine in tests after `setup.as.ts`.
- Calendar: exhaustive provenance; `isCalendarOk` / `isCalendarAutomationEligible` (live complete).
- `getEvents(signal: AbortSignal)` on ports/providers.
- Renderer user HTML: `escapeHtml()`.
- Windows OAuth only via tray/Settings — never lifecycle auto-start.
- BrowserWindows: `sandbox`, `contextIsolation`, no Node integration.
- Do not re-export domain/infrastructure symbols from utils or shared.

## Wrapper provider recipe

Add new meeting hosts after updating **both** extraction paths and allowlists:

1. Swift `findMeetUrl` in `googlemeet-events.swift` (Zoom → Meet → Calendly order).
2. `domain/services/url-extract.ts` regex priority for cloud providers.
3. `domain/policies/meet-url-allowlist.ts` + preload hostname check.
4. Tests under `tests/domain/` (extract, allowlist, buildMeetUrl) + main egress tests.

Egress allowlisting remains in ShellMeetingOpener / `openMeetingUrl` / `joinMeetingById` / `APP_OPEN_EXTERNAL`.

## Tests

Vitest projects: `tests/domain/`, `tests/application/`, `tests/main/` (Electron mocks + `setup.main.ts` + `setup.as.ts`), `tests/renderer/` (jsdom + `setup.as.ts`), `tests/shared/`, `tests/scripts/`. Helpers: `tests/helpers/`. Bench: `vitest.bench.config.ts` (not workspace). Coverage floors: see `tests/AGENTS.md`.
