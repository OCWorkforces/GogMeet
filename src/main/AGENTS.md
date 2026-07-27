# Main Process — Electron Main

Electron main owns app lifecycle, tray/menu, BrowserWindows, system APIs, IPC handlers, scheduler orchestration, settings persistence, and **calendar access through pluggable providers** (macOS EventKit / Windows Google Calendar). `app/lifecycle.ts` is the startup/shutdown coordinator.

## Files and subsystems

| Area | Files | Responsibility |
| --- | --- | --- |
| Root | `index.ts`, `tray.ts`, `events.ts`, `googlemeet-events.swift` | bootstrap (single-instance), tray, bus, Swift **source** (Darwin) |
| `app/` | `lifecycle.ts`, `ipc.ts` | init order, shutdown, IPC registration |
| `facades/` | `calendar.ts`, `calendar-watcher.ts`, `calendar-status.ts`, `settings.ts` | calendar facade + UI status, watcher, last poll status, settings v2 |
| `application/` | ports, use-cases | ports + use-case factories |
| `infrastructure/` | adapters | driven adapters (settings store, opener, …) |
| `composition/` | `app-graph.ts`, `bind-composition.ts` | `createAppGraph` + use-case default rebind |
| `calendar/` | factory, providers, auth, url-extract, offline-cache | CalendarProvider backends |
| `platform/` | `os.ts` | `isDarwin` / `isWin32` |
| `windows/` | about, alert, settings | BrowserWindow singletons + platform chrome |
| `system/` | power, shortcuts, auto-launch, **auto-updater**, notification | OS integration |
| `scheduler/` | facade + internals | poll, timers, auto-open, alerts |
| `swift/` | binary-manager, parser, sidecar, … | EventKit helper leaf (Darwin provider only) |
| `ipc-handlers/` | per-domain handlers | typed IPC |
| `menu/` | `meeting-menu.ts` | tray menu templates (meetings + Windows Connect CTAs) |
| `utils/` | browser-window, window-chrome, meet-url, url-validation, platform (meeting host) | security + helpers |

## Lifecycle order

`initializeApp(win)` order:

1. `warmupCalendarProvider()` — Swift compile on Darwin / token soft-refresh on Google (background).
2. `registerIpcHandlers(win)`.
3. Parallel `loadSettings()` + calendar permission status; **auto-request permission only on Darwin** (`shouldAutoRequestCalendarPermission()`).
4. `setupTray(win)`.
5. Scheduler callbacks + window injection.
6. `startScheduler()` then `startCalendarWatcher()` (EventKit watch or poll-only).
7. Power, shortcuts, notifications, auto-launch.
8. `initAutoUpdater()` — packaged non-portable only.

`shutdownApp()`: power cleanup → stop scheduler → stop watcher → unregister shortcuts.
7. `initPowerManagement` on resume/unlock: `invalidateCalendarPermissionCache()` → `reviveCalendarWatcher()` → `restartScheduler()`.
9. `initAutoUpdater()` (no-op when unpackaged).

## Architecture rules

- `events.ts` decouples scheduler/power/calendar UI from tray (`meeting-list-updated`, `calendar-status-updated`, `power-state-changed`).
- `scheduler/facade.ts` is the only scheduler import outside `scheduler/`.
- `facades/calendar.ts` is the only calendar import for scheduler/IPC/tray (not factory/providers).
- `swift/` only from `calendar/providers/darwin-eventkit.ts` and internal `swift/**`.
- `utils/platform.ts` = Meet/Zoom detection; `platform/os.ts` = OS.

## IPC and security

- `typedHandle` / `typedSend`; always validate sender for renderer-originated IPC.
- Meeting egress: `openMeetingUrl` / allowlist; rebrand fire-and-forget payloads in main.
- Sandbox + context isolation + no Node in renderers.
- Meeting joins go through `utils/join-meeting.ts` (`joinMeetingById`); URL egress uses `openMeetingUrl()` → `Result`. Non-meeting links use documented helpers (`openSystemSettings`, About repo exact match).

## Tray invariants

- Install menu with `tray.setContextMenu()` before first activation.
- Refresh on `meeting-list-updated` and `calendar-status-updated`.
- macOS click: `forcePoll` only. Windows click: `forcePoll` + `popUpContextMenu`.
- Countdown: `setTitle` on Darwin; capped tooltip on Windows (16/32 theme icons).

## Notes

- Swift source `asarUnpack` for packaged mac builds.
- Windows Google requires `GOOGLE_OAUTH_CLIENT_ID` at runtime/package.
- Fixture: unpackaged + `GOGMEET_CALENDAR_FIXTURE` path only.
- `index.ts` configures `electron-log` via `utils/log.ts` and suppresses Chromium DNS sorter warnings with `log-level=3`.
