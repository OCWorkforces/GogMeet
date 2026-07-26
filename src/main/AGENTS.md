# Main Process — Electron Main

Electron main owns app lifecycle, tray/menu, BrowserWindows, system APIs, IPC handlers, scheduler orchestration, settings persistence, and macOS Calendar access through Swift EventKit. `app/lifecycle.ts` is the startup/shutdown coordinator.

## Files and subsystems

| Area | Files | Responsibility |
| --- | --- | --- |
| Root | `index.ts`, `tray.ts`, `events.ts`, `googlemeet-events.swift` | app bootstrap (single-instance lock), tray, event bus, Swift source |
| `app/` | `lifecycle.ts`, `ipc.ts` | initialization order, shutdown, IPC registration |
| `domain/` | `calendar.ts`, `calendar-watcher.ts`, `settings.ts` | EventKit calls, calendar watcher, settings JSON/migrations |
| `platform/` | `os.ts` | OS predicates (`isDarwin` / `isWin32`); not meeting-host detection |
| `windows/` | `about-window.ts`, `alert-window.ts`, `settings-window.ts` | secure BrowserWindow singletons |
| `system/` | `power.ts`, `shortcuts.ts`, `auto-launch.ts`, `auto-updater.ts`, `notification.ts` | OS integration |
| `scheduler/` | see `scheduler/AGENTS.md` | polling, timers, auto-open, alert scheduling |
| `swift/` | see `swift/AGENTS.md` | Swift binary cache, parser, event validation |
| `ipc-handlers/` | see `ipc-handlers/AGENTS.md` | typed IPC handlers and push helpers |
| `menu/` | see `menu/AGENTS.md` | tray context menu template |
| `utils/` | see `utils/AGENTS.md` | URL validation, meet URL building, secure window helpers, window chrome |

## Lifecycle order

`initializeApp(win)` must keep this order unless tests and startup dependencies are updated:

1. `ensureBinary()` pre-warms the Swift helper in the background; init does not block on it.
2. `registerIpcHandlers(win)` wires invoke/on handlers before renderer calls can arrive.
3. `loadSettings()` and the calendar permission check run in parallel; settings load is critical, permission errors are collected.
4. `setupTray(win)` creates the tray and menu subscriptions.
5. `setTrayTitleCallback(updateTrayTitle)`, `setSchedulerWindow(win)`, and `initPowerCallbacks(...)` inject scheduler dependencies.
6. `startScheduler()` starts polling, then `startCalendarWatcher()` starts the EventKit sidecar.
7. `initPowerManagement(() => restartScheduler())`, `initPowerEvents()`, `registerShortcuts()`, notification check, auto-launch sync.

`shutdownApp()` cleans power management, stops scheduler, then stops the calendar watcher.

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
- Meeting URL egress uses `openMeetingUrl()` after allowlist validation; non-meeting external links need an exact documented guard before `shell.openExternal()`.
- Keep `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` on every BrowserWindow.

## Important invariants

- Tray icons use `nativeImage.createFromPath()`, not `fs.readFileSync()`.
- Tray setup must install a native context menu with `tray.setContextMenu()` before the first click; refresh that menu when cached meetings change, and keep click handlers limited to explicit refresh work such as `forcePoll()`.
- Swift source must remain unpacked from ASAR; `swiftc` cannot compile inside ASAR.
- `SWIFT_SRC_DEV` is relative to bundled `lib/main/index.cjs`; verify before editing.
- `index.ts` suppresses Chromium DNS sorter warnings with `app.commandLine.appendSwitch("log-level", "3")`; do not remove casually.
- `system/power.ts` sleep prevention is reference-counted: every `preventSleep()` needs matching `allowSleep()`.
