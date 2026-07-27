# Main Utils — Process Utilities

**Parent:** `src/main/AGENTS.md`

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `browser-window.ts` | BrowserWindow config factory, CSP enforcement | `SECURE_WEB_PREFERENCES`, `getPreloadPath()`, `loadWindowContent()`, `setupCspHeaders()` |
| `window-chrome.ts` | Platform BrowserWindow chrome + alert always-on-top | `platformWindowChrome()`, `applyAlertAlwaysOnTop()` |
| `meet-url.ts` | Thin allowlisted open (delegates to ShellMeetingOpener) | `openMeetingUrl()` |
| `join-meeting.ts` | Join hub free function (default-bound use case) | `joinMeetingById()`, `bindJoinMeeting()` |
| `packageInfo.ts` | Lazy-load + cache `package.json` | `getPackageInfo()`, `PackageInfo` |
| `log.ts` | electron-log bootstrap | `configureMainLogging()` |
| `system-settings.ts` | Open OS settings (non-meeting egress) | `openSystemSettings()` |

## CANONICAL HOMES (not in this package)

| Concern | Canonical home |
| --- | --- |
| URL allowlist + validate | `domain/services/url-validation.ts`, `domain/policies/meet-url-allowlist.ts` |
| buildMeetUrl / detectPlatform | `domain/services/build-meet-url.ts`, `platform.ts` |
| URL extract / clean description | `domain/services/url-extract.ts`, `clean-description.ts` |
| Shell opener factory | `infrastructure/electron/shell-meeting-opener.ts` |

## RULES

- Before meeting URL egress, use `openMeetingUrl()` / `joinMeetingById` / graph surfaces.
- Join paths must use `joinMeetingById` (not raw unenriched openExternal).
- Do not re-export domain or infrastructure modules from this package.
- Prefer `createShellMeetingOpener` from infrastructure for new composition wiring; `openMeetingUrl` remains the free-function convenience for scheduler adapters.
