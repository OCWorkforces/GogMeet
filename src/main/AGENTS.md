# Main Process — Electron Main

Electron main owns app lifecycle, tray/menu, BrowserWindows, system APIs, IPC handlers, scheduler orchestration, settings persistence, and **calendar access through pluggable providers** (macOS EventKit / Windows Google Calendar). `app/lifecycle.ts` is the startup/shutdown coordinator; `composition/app-graph.ts` is the composition root.

## Files and subsystems

| Area | Files | Responsibility |
| --- | --- | --- |
| Root | `index.ts`, `tray.ts`, `events.ts`, `googlemeet-events.swift` | bootstrap (single-instance), tray, bus, Swift **source** (Darwin) |
| `app/` | `lifecycle.ts`, `ipc.ts` | init order, shutdown, IPC registration |
| `composition/` | `app-graph.ts`, `bind-composition.ts`, `create-test-app-graph.ts` | `createAppGraph` + use-case default rebind |
| `application/` | `ports/`, `use-cases/` | ports + pure-ish use-case factories |
| `infrastructure/` | `settings/`, `electron/` | JsonSettingsStore, ShellMeetingOpener |
| `facades/` | calendar, watcher, status, settings | free-function main surface + default binds |
| `calendar/` | factory, providers, auth, offline-cache | CalendarProvider backends |
| `platform/` | `os.ts` | `isDarwin` / `isWin32` |
| `windows/` | about, alert, settings | BrowserWindow singletons + platform chrome |
| `system/` | power, shortcuts, auto-launch, auto-updater, notification | OS integration |
| `scheduler/` | facade + core + adapters + timers | poll, plan, auto-open, alerts |
| `swift/` | binary-manager, parser, sidecar, … | EventKit helper leaf (Darwin provider only) |
| `ipc-handlers/` | per-domain handlers | typed IPC (receive `AppGraph`) |
| `menu/` | `meeting-menu.ts` | tray menu templates via callbacks |
| `utils/` | browser-window, window-chrome, meet-url, join-meeting, log, packageInfo, system-settings | security + join hub + helpers |

## Lifecycle order

`initializeApp(win)` order:

1. `createAppGraph()` — bind composition; store as `activeGraph`.
2. `warmupCalendarProvider()` — Swift compile on Darwin / token soft-refresh on Google (background).
3. `registerIpcHandlers(win, graph)`.
4. Parallel `graph.settings.load()` + calendar permission status; **auto-request only on Darwin** (`shouldAutoRequestPermission()`).
5. `setupTray(win, graph)`.
6. Scheduler callbacks + window injection via `graph.scheduler.*`.
7. `graph.scheduler.start()` then `graph.watcher.start()`.
8. Power, shortcuts (`registerShortcuts(graph)`), notifications, auto-launch.
9. `initAutoUpdater()` — packaged non-portable only.

`shutdownApp()`: power cleanup → `graph.scheduler.stop()` + `graph.watcher.stop()` (or free-fn fallback) → unregister shortcuts → clear `activeGraph`.

Power resume/unlock: `invalidatePermissionCache()` → `watcher.revive()` → `scheduler.restart()`.

## Architecture rules

- `events.ts` decouples scheduler/power/calendar UI from tray (`meeting-list-updated`, `calendar-status-updated`, `power-state-changed`).
- Prefer `AppGraph` for lifecycle, IPC, tray, and shortcuts. Free functions remain for internal adapters and tests.
- `scheduler/facade.ts` is the only scheduler import outside `scheduler/` (and graph wrappers).
- Callers use `facades/calendar.ts` (not factory/providers) for calendar access.
- `swift/` only from `calendar/providers/darwin-eventkit.ts` and internal `swift/**`.
- Meeting host detection: `domain/services/platform.ts`. OS: `platform/os.ts`.

## IPC and security

- `typedHandle` / `typedSend`; always validate sender for renderer-originated IPC.
- Meeting egress: ShellMeetingOpener / `openMeetingUrl` / allowlist; rebrand fire-and-forget payloads in main.
- Sandbox + context isolation + no Node in renderers.
- Meeting joins go through `joinMeetingById` / `graph.join.byId`. Non-meeting links use documented helpers (`openSystemSettings`, About repo exact match).

## Tray invariants

- Install menu with `tray.setContextMenu()` before first activation.
- Refresh on `meeting-list-updated` and `calendar-status-updated`.
- macOS click: `forcePoll` only. Windows click: `forcePoll` + `popUpContextMenu`.
- Countdown: `setTitle` on Darwin; capped tooltip on Windows (16/32 theme icons).
- Menu join/refresh via `MenuCallbacks.onJoinMeeting` / `onForcePoll` (graph-backed).

## Notes

- Swift source `asarUnpack` for packaged mac builds.
- Windows Google requires `GOOGLE_OAUTH_CLIENT_ID` at runtime/package.
- Fixture: unpackaged + `GOGMEET_CALENDAR_FIXTURE` path only.
- `index.ts` configures `electron-log` via `utils/log.ts` and suppresses Chromium DNS sorter warnings with `log-level=3`.
