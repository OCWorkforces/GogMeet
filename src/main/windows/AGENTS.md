# Windows — BrowserWindow Singletons

**Parent:** `src/main/AGENTS.md`

Auxiliary BrowserWindow factories beyond the main list window (often hidden; tray menu is primary list UI). Platform chrome from `utils/window-chrome.ts` (`popover` / `settings` / `alert` / `about`). Settings and About use solid product canvas **`#0d1117`** (`DIALOG_BACKGROUND_COLOR`).

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `dock-visibility.ts` | Ref-counted macOS Dock show/hide for dialog holders | `acquireDockVisibility`, `releaseDockVisibility` |
| `about-window.ts` | About box: data: HTML, 320×380, **hide-cache**, CSP `script-src 'none'`, https-only repo | `showAbout`, `destroyAboutWindow`, `isSafeAboutRepositoryUrl` |
| `alert-window.ts` | Meeting alert overlay: queue, uid coalesce, **hide/show reuse** | `showAlert(event)`, `destroyAlertWindow()` |
| `settings-window.ts` | Prefs 520×760; **hide-cache** + soft-refresh; Dock claim | `createSettingsWindow`, `destroySettingsWindow`, `getSettingsWindow` |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Reuse vs reopen About | `showAbout` re-presents cached window (no reload) when still alive |
| About close (CSP-safe) | sentinel hide-cache; `destroyAboutWindow` on quit |
| About openExternal | exact package `repository` **and** `https:` via `isSafeAboutRepositoryUrl` |
| Alert queue + coalesce | `alert-window.ts` → `pendingAlerts`, `isAlertShowing`, `__alertUid` / `__alertStartMs` |
| Hide/reuse vs recreate | `alert-window.ts` → prefer alive hidden window; `close` prevents default + `hide()`; `__forceDestroy` for real destroy |
| Reschedule in place | same uid, different startMs → `showAlertInternal` without canceling pending open |
| Defer next alert after hide | `processNextAlert()` uses `setImmediate` |
| Project MeetingEvent → AlertPayload | `toAlertPayload()` (drops `meetUrl`; sets `hasMeetUrl`) |
| Dock show/hide | Shared refcount via `dock-visibility.ts` (Settings + About holders) |
| Theme solid fill (Windows) | `bindWindowsThemeBackground(win, "settings"\|"about")` |
| Force teardown (quit/tests) | `destroyAlertWindow` / `destroySettingsWindow` / `destroyAboutWindow` (lifecycle) |

## NOTES

- Settings loads via `loadWindowContent` (preload + session CSP). About is **data: HTML** (no preload / no `loadWindowContent`); embedded CSP meta + main navigation intercept for close sentinel. Package metadata is HTML-escaped.
- About: **not** `alwaysOnTop`; traffic-light safe top padding; compact content stack (no middle void); **16px** bottom pad under Close; decorative 96px app icon with brand-blue aurora (`shared/utils/app-icon-aurora.ts` + `about-icon.svg` data: URI, non-link) + single GitHub text link; Escape + Close hide-cache the window.
- Settings: `alwaysOnTop: true`; first open loads renderer once; subsequent opens only `show`/`focus` (state preserved). Brand aurora lives in the settings renderer (not this module).
- Alert payload omits `meetUrl` by design; renderer joins via `app.joinMeeting(id)`.
- Alert always-on-top uses `applyAlertAlwaysOnTop` (screen-saver level + all workspaces on Darwin; plain always-on-top on Windows).
- Settings toggles Dock only when `app.dock` exists (macOS). App remains tray-only on Windows.
- Scheduler restart / display-only tray rebuild on settings save is owned by IPC handlers, not these files.
- About / settings / alert all **hide-cache** between presentations (`close` + `preventDefault` unless `__forceDestroy`). Real destroy on `shutdownApp` / test teardown. Alert generation counter guards stale ready-to-show / DOM clear races.
