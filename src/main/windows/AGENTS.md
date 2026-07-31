# Windows — BrowserWindow Singletons

**Parent:** `src/main/AGENTS.md`

Auxiliary BrowserWindow factories beyond the main list window (often hidden; tray menu is primary list UI).

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `about-window.ts` | About panel: version HTML, repository link, embeds `about-icon.svg` | `showAbout(mainWindow)` |
| `alert-window.ts` | Full-screen meeting alert overlay with queue + duplicate-uid coalescing | `showAlert(event)` |
| `settings-window.ts` | Settings UI; Dock show/hide on macOS only | `createSettingsWindow()` |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Reuse vs reopen About | `about-window.ts` → module ref + `isDestroyed()` check |
| Alert queue + coalesce | `alert-window.ts` → `pendingAlerts`, `isAlertShowing`, `__alertUid` |
| Defer next alert after close | `alert-window.ts` → `processNextAlert()` uses `setImmediate` |
| Project MeetingEvent → AlertPayload | `alert-window.ts` → `toAlertPayload()` (drops `meetUrl`; sets `hasMeetUrl`) |
| Dock show/hide | `settings-window.ts` → `app.dock?.show()` / `hide()` |

## NOTES

- About and settings load via `loadWindowContent` / chrome helpers. About may use inline `data:` HTML with CSP-safe close via sentinel navigation.
- Alert payload omits `meetUrl` by design; renderer joins via `app.joinMeeting(id)`.
- Settings toggles Dock only when `app.dock` exists (macOS). App remains tray-only on Windows.
- Scheduler restart / display-only tray rebuild on settings save is owned by IPC handlers, not these files.
- Alert always-on-top uses `applyAlertAlwaysOnTop` (screen-saver level + all workspaces on Darwin).
- Singleton pattern: module-level `let win`, focus if alive, null on `closed`.
