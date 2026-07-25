# Main Utils — Process Utilities

**Parent:** `src/main/AGENTS.md`

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `browser-window.ts` | BrowserWindow config, CSP | `SECURE_WEB_PREFERENCES`, `getPreloadPath()`, `loadWindowContent()`, `setupCspHeaders()` |
| `url-validation.ts` | Allowlist validation using shared hostnames | `MEETING_URL_ALLOWLIST` (derived), `isAllowedMeetUrl()`, `validateMeetUrl()` |
| `meet-url.ts` | Platform identity params + egress | `buildMeetUrl()`, `openMeetingUrl()` → `Result<void, string>` |
| `join-meeting.ts` | Single join hub for all UI paths | `joinMeetingById(id)` → open + `cancelPendingBrowserOpen` |
| `system-settings.ts` | Non-meeting System Settings panes | `openSystemSettings("calendars" \| "notifications")` |
| `platform.ts` | Meet vs Zoom detection | `detectPlatform()` |
| `packageInfo.ts` | Lazy `package.json` | `getPackageInfo()` |
| `log.ts` | electron-log bootstrap | `configureMainLogging()`, `mainLog` / `schedulerLog` / `calendarLog` |

## PATTERNS

- **Host allowlist SSOT:** `src/shared/meet-url-allowlist.ts`. Main derives prefix form for tests; preload imports shared hostnames.
- **Join parity:** menu, hotkey, renderer, and alert must use `joinMeetingById` (not raw `openExternal` with unenriched URLs).
- **`openMeetingUrl` Result:** callers must handle `ok: false`; browser-timer logs failures.
- **`loadWindowContent(win, page)`** is the only dev/prod loader.
- **`buildMeetUrl` identity:** `authuser` (Meet), `uname` (Zoom) via `URL.searchParams.set()`.

## ANTI-PATTERNS

- Never hard-code host allowlists outside `shared/meet-url-allowlist.ts` + intentional consumers.
- Never call `shell.openExternal` for meeting URLs outside `openMeetingUrl`.
- Never skip mark-opened after a successful user join (double-tab risk).
