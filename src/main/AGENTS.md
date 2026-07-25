# Main Process — Electron Main

Electron main owns app lifecycle, tray/menu, BrowserWindows, system APIs, IPC handlers, scheduler orchestration, settings persistence, and macOS Calendar access through Swift EventKit. `app/lifecycle.ts` is the startup/shutdown coordinator.

## Files and subsystems

| Area | Files | Responsibility |
| --- | --- | --- |
| Root | `index.ts`, `tray.ts`, `events.ts`, `googlemeet-events.swift` | app bootstrap + logging, tray menu UI, event bus, Swift source |
| `app/` | `lifecycle.ts`, `ipc.ts` | initialization order, shutdown, IPC registration |
| `domain/` | `calendar.ts`, `calendar-watcher.ts`, `calendar-status.ts`, `settings.ts` | EventKit, watcher, last poll status, settings v2 JSON/migrations |
| `windows/` | `about-window.ts`, `alert-window.ts`, `settings-window.ts` | secure BrowserWindow singletons |
| `system/` | `power.ts`, `shortcuts.ts`, `auto-launch.ts`, `auto-updater.ts`, `notification.ts` | OS integration (updater wired from lifecycle) |
| `scheduler/` | see `scheduler/AGENTS.md` | polling, timers, auto-open, late-join, alert scheduling |
| `swift/` | see `swift/AGENTS.md` | Swift binary cache, parser, event validation, watch recovery |
| `ipc-handlers/` | see `ipc-handlers/AGENTS.md` | typed IPC handlers and push helpers |
| `menu/` | see `menu/AGENTS.md` | tray context menu template (primary meeting list) |
| `utils/` | see `utils/AGENTS.md` | join hub, URL validation, meet URL, system settings, logging |

## Lifecycle order

`initializeApp(win)` must keep this order unless tests and startup dependencies are updated:

1. `ensureBinary()` pre-warms the Swift helper in the background; init does not block on it.
2. `registerIpcHandlers(win)` wires invoke/on handlers before renderer calls can arrive.
3. `loadSettings()` and the calendar permission check run in parallel; settings load is critical, permission errors are collected.
4. `setupTray(win)` creates the tray and installs the native context menu.
5. `setTrayTitleCallback(updateTrayTitle)`, `setSchedulerWindow(win)`, and `initPowerCallbacks(...)` inject scheduler dependencies.
6. `startScheduler()` starts polling, then `startCalendarWatcher()` starts the EventKit sidecar.
7. `initPowerManagement` on resume/unlock: `invalidateCalendarPermissionCache()` → `reviveCalendarWatcher()` → `restartScheduler()`.
8. `initPowerEvents()`, `registerShortcuts()`, notification permission check, auto-launch sync.
9. `initAutoUpdater()` (no-op when unpackaged).

`shutdownApp()` cleans power management, stops scheduler, stops the calendar watcher, unregisters shortcuts.

## Architecture rules

- `events.ts` is the decoupling seam. Scheduler emits `meeting-list-updated`; tray subscribes and refreshes its installed native context menu.
- `scheduler/facade.ts` is the only scheduler import allowed outside `scheduler/`.
- `scheduler/state/` is internal-only, enforced by `.sentrux/rules.toml` (`state-internal-only`).
- `swift/` is a leaf dependency used by `domain/calendar.ts`; do not make Swift modules depend on app/window/scheduler code.
- `app/` can depend on subsystems; subsystems should not depend on `app/`.
- BrowserWindow options come from `utils/browser-window.ts` secure defaults unless a window has a documented exception.

## IPC and security

- Use `typedHandle()` for invokes, `validateSender()` / `validateOnSender()` for every renderer-originated event.
- Use `typedSend()` for push channels and guard destroyed windows.
- Meeting joins go through `utils/join-meeting.ts` (`joinMeetingById`); URL egress uses `openMeetingUrl()` → `Result`. Non-meeting links use documented helpers (`openSystemSettings`, About repo exact match).
- Keep `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` on every BrowserWindow.

## Important invariants

- Tray icons use `nativeImage.createFromPath()`, not `fs.readFileSync()`.
- Native tray menu is the primary meeting list UI. Install with `tray.setContextMenu()` before the first click; rebuild on `meeting-list-updated` and calendar status changes.
- Successful joins must call facade `cancelPendingBrowserOpen` so scheduled auto-open does not double-open.
- Swift source must remain unpacked from ASAR; `swiftc` cannot compile inside ASAR.
- `SWIFT_SRC_DEV` is relative to bundled `lib/main/index.cjs`; verify before editing.
- `index.ts` configures `electron-log` via `utils/log.ts` and suppresses Chromium DNS sorter warnings with `log-level=3`.
- `system/power.ts` sleep prevention is reference-counted: every `preventSleep()` needs matching `allowSleep()`.
