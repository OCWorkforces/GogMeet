# Windows — BrowserWindow Singletons

**Parent:** `src/main/AGENTS.md`

Auxiliary BrowserWindow factories beyond the main list window (often hidden; tray menu is primary list UI).

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `about-window.ts` | About panel; exact-match repo `openExternal` | `showAbout(mainWindow)` |
| `alert-window.ts` | Full-screen meeting alert; queue + uid coalesce | `showAlert(event, autoOpenAt?)` |
| `settings-window.ts` | Settings UI; Dock while open | `createSettingsWindow()` |

## NOTES

- Load via `loadWindowContent` + `getPreloadPath` / secure prefs.
- **Alert payload** (`toAlertPayload`): includes `hasMeetUrl` and optional `autoOpenAt`; **omits raw `meetUrl`**. Join is renderer → `app.joinMeeting(id)` in main.
- Alert dismissal still cancels pending browser open via `ALERT_DISMISSED` → facade.
- Settings window toggles Dock; timing settings restart is owned by settings IPC handler, not this file.
- Singleton pattern: module-level window ref, focus if alive, null on `closed`.
