# Windows — BrowserWindow Singletons

**Parent:** `src/main/AGENTS.md`

Auxiliary BrowserWindow factories beyond the main list window (often hidden; tray menu is primary list UI). Platform chrome from `utils/window-chrome.ts` (`popover` / `settings` / `alert` / `about`). Settings and About use solid product canvas **`#0d1117`** (`DIALOG_BACKGROUND_COLOR`).

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `about-window.ts` | About box: data: HTML, 320×420, CSP meta, https-only repo | `showAbout(mainWindow)`, `isSafeAboutRepositoryUrl` |
| `alert-window.ts` | Meeting alert overlay: queue, uid coalesce, **hide/show reuse** | `showAlert(event)`, `destroyAlertWindow()` |
| `settings-window.ts` | Prefs window 520×760; Dock show/hide on macOS only | `createSettingsWindow()` |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Reuse vs reopen About | `about-window.ts` → module ref + `isDestroyed()` check |
| About close (CSP-safe) | sentinel `ABOUT_CLOSE_URL` + `will-navigate` / `will-frame-navigate` + `executeJavaScript` wire |
| About openExternal | exact package `repository` **and** `https:` via `isSafeAboutRepositoryUrl` |
| Alert queue + coalesce | `alert-window.ts` → `pendingAlerts`, `isAlertShowing`, `__alertUid` / `__alertStartMs` |
| Hide/reuse vs recreate | `alert-window.ts` → prefer alive hidden window; `close` prevents default + `hide()`; `__forceDestroy` for real destroy |
| Reschedule in place | same uid, different startMs → `showAlertInternal` without canceling pending open |
| Defer next alert after hide | `processNextAlert()` uses `setImmediate` |
| Project MeetingEvent → AlertPayload | `toAlertPayload()` (drops `meetUrl`; sets `hasMeetUrl`) |
| Dock show/hide | `settings-window.ts` → `app.dock?.show()` / `hide()` |
| Theme solid fill (Windows) | `bindWindowsThemeBackground(win, "settings"\|"about")` |
| Force teardown (quit/tests) | `destroyAlertWindow()` |

## NOTES

- Settings loads via `loadWindowContent` (preload + session CSP). About is **data: HTML** (no preload / no `loadWindowContent`); embedded CSP meta + main navigation intercept for close sentinel. Package metadata is HTML-escaped.
- About: **not** `alwaysOnTop`; traffic-light safe top padding; decorative icon (non-link) + single GitHub text link; Escape + Close.
- Settings: `alwaysOnTop: true`; singleton focus if alive.
- Alert payload omits `meetUrl` by design; renderer joins via `app.joinMeeting(id)`.
- Alert always-on-top uses `applyAlertAlwaysOnTop` (screen-saver level + all workspaces on Darwin; plain always-on-top on Windows).
- Settings toggles Dock only when `app.dock` exists (macOS). App remains tray-only on Windows.
- Scheduler restart / display-only tray rebuild on settings save is owned by IPC handlers, not these files.
- About / settings: classic singleton (focus if alive, null on `closed`). Alert: singleton with **reuse** — hide instead of destroy between presentations; generation counter guards stale ready-to-show / DOM clear races.
