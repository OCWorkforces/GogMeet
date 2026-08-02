# Windows — BrowserWindow Singletons

**Parent:** `src/main/AGENTS.md`

Auxiliary BrowserWindow factories beyond the main list window (often hidden; tray menu is primary list UI). Platform chrome from `utils/window-chrome.ts` (`popover` / `settings` / `alert` / `about`).

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `about-window.ts` | About panel: version HTML, repository link, embeds `about-icon.svg` | `showAbout(mainWindow)` |
| `alert-window.ts` | Meeting alert overlay: queue, uid coalesce, **hide/show reuse** | `showAlert(event)`, `destroyAlertWindow()` |
| `settings-window.ts` | Settings UI (520×680); Dock show/hide on macOS only | `createSettingsWindow()` |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Reuse vs reopen About | `about-window.ts` → module ref + `isDestroyed()` check |
| Alert queue + coalesce | `alert-window.ts` → `pendingAlerts`, `isAlertShowing`, `__alertUid` / `__alertStartMs` |
| Hide/reuse vs recreate | `alert-window.ts` → prefer alive hidden window; `close` prevents default + `hide()`; `__forceDestroy` for real destroy |
| Reschedule in place | same uid, different startMs → `showAlertInternal` without canceling pending open |
| Defer next alert after hide | `processNextAlert()` uses `setImmediate` |
| Project MeetingEvent → AlertPayload | `toAlertPayload()` (drops `meetUrl`; sets `hasMeetUrl`) |
| Dock show/hide | `settings-window.ts` → `app.dock?.show()` / `hide()` |
| Force teardown (quit/tests) | `destroyAlertWindow()` |

## NOTES

- About and settings load via `loadWindowContent` / chrome helpers. About uses inline HTML with CSP-safe close via sentinel navigation (`ABOUT_CLOSE_URL` intercepted in main — no inline scripts).
- Alert payload omits `meetUrl` by design; renderer joins via `app.joinMeeting(id)`.
- Alert always-on-top uses `applyAlertAlwaysOnTop` (screen-saver level + all workspaces on Darwin; plain always-on-top on Windows).
- Settings toggles Dock only when `app.dock` exists (macOS). App remains tray-only on Windows.
- Scheduler restart / display-only tray rebuild on settings save is owned by IPC handlers, not these files.
- About / settings: classic singleton (focus if alive, null on `closed`). Alert: singleton with **reuse** — hide instead of destroy between presentations; generation counter guards stale ready-to-show / DOM clear races.
