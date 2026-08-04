# Main Utils — Process Utilities

**Parent:** `src/main/AGENTS.md`

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `browser-window.ts` | BrowserWindow config factory, CSP enforcement | `SECURE_WEB_PREFERENCES`, `getPreloadPath()`, `loadWindowContent()`, `setupCspHeaders()` |
| `window-chrome.ts` | Platform chrome + dialog canvas `#0d1117` + alert always-on-top | `DIALOG_BACKGROUND_COLOR`, `platformWindowChrome()`, `windowsSolidBackgroundColor()`, `bindWindowsThemeBackground()`, `applyAlertAlwaysOnTop()` |
| `meet-url.ts` | Thin allowlisted open (delegates to ShellMeetingOpener) | `openMeetingUrl()` |
| `join-meeting.ts` | Join hub free function (default-bound use case) | `joinMeetingById()`, `bindJoinMeeting()` |
| `packageInfo.ts` | Lazy-load + cache `package.json` | `getPackageInfo()`, `PackageInfo`, `clearPackageInfoCache`, `isPackageInfoLoaded` |
| `log.ts` | electron-log bootstrap + scopes | `configureMainLogging()`, `mainLog`, `schedulerLog`, `calendarLog` |
| `system-settings.ts` | Open OS settings (non-meeting egress) | `openSystemSettings()` |
| `performance-trace.ts` | Opt-in redacted measurement records | `perfTrace`, `isPerfTraceEnabled`, `GOGMEET_PERF_TRACE=1` |

## Window chrome notes

- **Popover:** Darwin vibrancy; Windows opaque `#1c1c1e`.
- **Settings / About:** solid **`DIALOG_BACKGROUND_COLOR` (`#0d1117`)** on Darwin and Windows (no vibrancy — hex must read true). Matches renderer settings CSS and About inline styles.
- **Alert:** Darwin `titleBarStyle: hiddenInset` only; always-on-top via `applyAlertAlwaysOnTop`.
- `bindWindowsThemeBackground` keeps Windows solid fills updated; for settings/about the fill is fixed `#0d1117`.

## Performance trace

- Enabled **only** when `GOGMEET_PERF_TRACE=1`.
- Finite allowlist: operation enum, outcome, errorClass, numeric fields, coarse platform/arch/powerMode.
- No arbitrary string bags; no secrets (tokens, titles, URLs, bodies).
- Aggregate offline with `bun run perf:report`.

## CANONICAL HOMES (not in this package)

| Concern | Canonical home |
| --- | --- |
| URL allowlist + validate | `domain/services/url-validation.ts`, `domain/policies/meet-url-allowlist.ts` |
| buildMeetUrl / detectPlatform | `domain/services/build-meet-url.ts`, `platform.ts` |
| URL extract / clean description | `domain/services/url-extract.ts`, `clean-description.ts` |
| Shell opener factory | `infrastructure/electron/shell-meeting-opener.ts` |
| Unchecked casts | `shared/utils/as.ts` |
| Brand-icon aurora (About/Settings) | `shared/utils/app-icon-aurora.ts` |

## RULES

- Before meeting URL egress, use `openMeetingUrl()` / `joinMeetingById` / graph surfaces.
- Join paths must use `joinMeetingById` (not raw unenriched openExternal).
- Do not re-export domain or infrastructure modules from this package.
- Prefer `createShellMeetingOpener` from infrastructure for new composition wiring; `openMeetingUrl` remains the free-function convenience for scheduler adapters.
- Do not leave default-on tracing or secret-bearing metadata in product paths.
