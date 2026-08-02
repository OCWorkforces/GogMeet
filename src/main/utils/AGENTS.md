# Main Utils — Process Utilities

**Parent:** `src/main/AGENTS.md`

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `browser-window.ts` | BrowserWindow config factory, CSP enforcement | `SECURE_WEB_PREFERENCES`, `getPreloadPath()`, `loadWindowContent()`, `setupCspHeaders()` |
| `window-chrome.ts` | Platform BrowserWindow chrome (`popover` / `settings` / `alert` / `about`) + alert always-on-top | `platformWindowChrome()`, `applyAlertAlwaysOnTop()` |
| `meet-url.ts` | Thin allowlisted open (delegates to ShellMeetingOpener) | `openMeetingUrl()` |
| `join-meeting.ts` | Join hub free function (default-bound use case) | `joinMeetingById()`, `bindJoinMeeting()` |
| `packageInfo.ts` | Lazy-load + cache `package.json` | `getPackageInfo()`, `PackageInfo` |
| `log.ts` | electron-log bootstrap | `configureMainLogging()` |
| `system-settings.ts` | Open OS settings (non-meeting egress) | `openSystemSettings()` |
| `performance-trace.ts` | Opt-in redacted measurement records | `perfTrace`, `isPerfTraceEnabled`, `GOGMEET_PERF_TRACE=1` |

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

## RULES

- Before meeting URL egress, use `openMeetingUrl()` / `joinMeetingById` / graph surfaces.
- Join paths must use `joinMeetingById` (not raw unenriched openExternal).
- Do not re-export domain or infrastructure modules from this package.
- Prefer `createShellMeetingOpener` from infrastructure for new composition wiring; `openMeetingUrl` remains the free-function convenience for scheduler adapters.
- Do not leave default-on tracing or secret-bearing metadata in product paths.
