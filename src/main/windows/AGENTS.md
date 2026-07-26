# Windows — BrowserWindow Singletons

**Parent:** `src/main/AGENTS.md`

Auxiliary BrowserWindow factories beyond the main popover. Each is a singleton with its own lifecycle.

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `about-window.ts` | About panel: `alwaysOnTop`, `hiddenInset` titlebar, version-injected HTML, repository link, embeds `about-icon.svg` as data URI | `showAbout(mainWindow)` |
| `alert-window.ts` | Full-screen meeting alert overlay with queue + duplicate-uid coalescing | `showAlert(event)` |
| `settings-window.ts` | Settings UI; Dock show/hide on macOS only (`app.dock?.`); tray-only otherwise | `createSettingsWindow()` |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Reuse vs reopen About | `about-window.ts` → `aboutWindow` ref + `isDestroyed()` check |
| Alert queue + coalesce | `alert-window.ts` → `pendingAlerts`, `isAlertShowing`, `__alertUid` tag on window |
| Defer next alert after close | `alert-window.ts` → `processNextAlert()` uses `setImmediate` |
| Project MeetingEvent → AlertPayload | `alert-window.ts` → `toAlertPayload()` (drops `meetUrl`) |
| Dock show/hide | `settings-window.ts` → `app.dock?.show()` on ready, `app.dock?.hide()` on `closed` |

## NOTES

- All three windows load via `loadWindowContent(win, page)` and use `getPreloadPath()` from `utils/browser-window.js`. Chrome options come from `platformWindowChrome()` / `applyAlertAlwaysOnTop()` in `utils/window-chrome.js` (mac vibrancy vs Windows opaque).
- About window reads `about-icon.svg` once at module load (sync) and inlines it as `data:image/svg+xml,...`. Repository links are exact-match guarded against `packageJson.repository` before `shell.openExternal()`.
- Alert window is tagged with `win.__alertUid = event.id` so rapid `showAlert()` calls with the same uid are dropped (active or queued). Different uids queue and fire sequentially after the prior window closes.
- Alert payload omits `meetUrl` by design, the alert UI does not join meetings, dismissal only.
- Settings toggles Dock only when `app.dock` exists (macOS). App remains tray-only on Windows. Scheduler restart on settings save is owned by IPC handlers, not this file.
- Alert always-on-top uses `applyAlertAlwaysOnTop` (screen-saver level + all workspaces on Darwin; plain always-on-top on Windows).
- Singleton pattern is identical across all three: module-level `let win: BrowserWindow | null`, focus existing if alive, null out on `closed`.
