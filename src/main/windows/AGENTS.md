# Windows — BrowserWindow Singletons

**Parent:** `src/main/AGENTS.md`

Auxiliary BrowserWindow factories beyond the main popover. Each is a singleton with its own lifecycle.

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `about-window.ts` | About panel: `alwaysOnTop`, `hiddenInset` titlebar, version-injected HTML, repository link, embeds `about-icon.svg` as data URI | `showAbout(mainWindow)` |
| `alert-window.ts` | Full-screen meeting alert overlay with queue + duplicate-uid coalescing | `showAlert(event)` |
| `settings-window.ts` | Settings UI; visible in Dock while open, hidden on close | `createSettingsWindow()` |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Reuse vs reopen About | `about-window.ts` → `aboutWindow` ref + `isDestroyed()` check |
| Alert queue + coalesce | `alert-window.ts` → `pendingAlerts`, `isAlertShowing`, `__alertUid` tag on window |
| Defer next alert after close | `alert-window.ts` → `processNextAlert()` uses `setImmediate` |
| Project MeetingEvent → AlertPayload | `alert-window.ts` → `toAlertPayload()` (drops `meetUrl`) |
| Dock show/hide | `settings-window.ts` → `app.dock?.show()` on ready, `app.dock?.hide()` on `closed` |

## NOTES

- All three windows load via `loadWindowContent(win, page)` and use `getPreloadPath()` from `utils/browser-window.js`. See `utils/AGENTS.md` for security defaults.
- About window reads `about-icon.svg` once at module load (sync) and inlines it as `data:image/svg+xml,...`. Repository links are exact-match guarded against `packageJson.repository` before `shell.openExternal()`.
- Alert window is tagged with `win.__alertUid = event.id` so rapid `showAlert()` calls with the same uid are dropped (active or queued). Different uids queue and fire sequentially after the prior window closes.
- Alert payload omits `meetUrl` by design, the alert UI does not join meetings, dismissal only.
- Settings window is the only window that toggles Dock visibility, the app is tray-only otherwise. IPC settings updates trigger `restartScheduler()` from the handler side, not from this file.
- Singleton pattern is identical across all three: module-level `let win: BrowserWindow | null`, focus existing if alive, null out on `closed`.
