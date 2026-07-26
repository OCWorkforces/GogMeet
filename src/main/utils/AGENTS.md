# Main Utils — Process Utilities

**Parent:** `src/main/AGENTS.md`

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `browser-window.ts` | BrowserWindow config factory, CSP enforcement (typed via `CSPSource`/`CSPDirectiveName`/`CSPDirective`/`CSP` template literal types) | `SECURE_WEB_PREFERENCES`, `getPreloadPath()`, `loadWindowContent()`, `setupCspHeaders()`, `_resetCspForTest()` |
| `window-chrome.ts` | Platform BrowserWindow chrome (vibrancy vs opaque) + alert always-on-top helper | `platformWindowChrome()`, `applyAlertAlwaysOnTop()`, `WindowChromeKind` |
| `url-validation.ts` | URL allowlist + hostname-based validation (Google Meet, Zoom, Calendly) | `MEETING_URL_ALLOWLIST`, `isAllowedMeetUrl()`, `validateMeetUrl()` → `Result<MeetUrl, string>` |
| `meet-url.ts` | Multi-platform meeting URL builder + shell opener | `buildMeetUrl()`, `openMeetingUrl()` |
| `platform.ts` | Meeting platform detection (Google Meet vs Zoom) — **not** OS platform | `detectPlatform()` → `"google-meet" \| "zoom" \| undefined` |
| `packageInfo.ts` | Lazy-load + cache `package.json` with runtime validation | `getPackageInfo()`, `clearPackageInfoCache()`, `isPackageInfoLoaded()`, `PackageInfo` |

## PATTERNS

- **`loadWindowContent(win, page)`** — only function that handles both dev (Rsbuild dev server via `VITE_DEV_SERVER_URL`, default `http://localhost:5173/{page}.html`) and prod (packaged `{renderer}/{page}.html`) loading; no other caller should branch on dev/prod directly
- **CSP singleton** — `browser-window.ts` uses a module-level `cspHeadersConfigured` flag; `_resetCspForTest()` resets it for tests
- **CSP template literal types** — `browser-window.ts` defines `CSPSource`, `CSPDirectiveName`, `CSPDirective`, and `CSP` template literal types for compile-time Content-Security-Policy validation
- **`ALLOWED_HOSTNAMES`** in `url-validation.ts` — derived at module load from `MEETING_URL_ALLOWLIST` via `new URL(prefix).hostname`; preload keeps the only intentional mirror
- **`packageInfo.ts` uses `readFileSync`** — only sync file I/O in the main process; acceptable because it's a one-time lazy load at startup, result is frozen (`Object.freeze`)
- **`validateMeetUrl()`** returns `Result<MeetUrl, string>` — prefer this over `isAllowedMeetUrl()` when you need the branded type back
- **`buildMeetUrl()` identity params** — uses `URL.searchParams.set()` for the identity hint (`authuser` for Google Meet, `uname` for Zoom). This replaces any existing duplicates and preserves the URL fragment. Do not return to manual `?`/`&` string concatenation; that path produced duplicate keys and dropped fragments.
- **`platformWindowChrome(kind)`** — spread into BrowserWindow options; mac keeps vibrancy/`titleBarStyle`, Windows gets opaque `backgroundColor` without mac-only keys. OS checks live in `platform/os.ts`.

## ANTI-PATTERNS

- Never call `loadWindowContent` with raw URL strings — use the `page` parameter
- Never hard-code `localhost:5173` elsewhere — only `browser-window.ts` knows the dev server address
- Before meeting URL egress, use `openMeetingUrl()` or a documented handler guard; use `validateMeetUrl()` when a branded result is needed
- Never duplicate the allowlist except the intentional preload mirror; update main and preload together

## NOTES

- Calendly meeting URLs (`https://calendly.com/`) are supported. The browser handles the 302 redirect to the underlying Meet room transparently; the main process performs no redirect resolution.
- Free-text URL discovery for cloud calendars lives in `calendar/url-extract.ts` (not here); allowlist enforcement remains in this package’s validation + `meet-url` egress.
| `join-meeting.ts` | Single join hub for all UI paths | `joinMeetingById(id)` → open + `cancelPendingBrowserOpen` |
| `log.ts` | electron-log bootstrap | `configureMainLogging()`, `mainLog` / `schedulerLog` / `calendarLog` |
- **Join parity:** menu, hotkey, renderer, and alert must use `joinMeetingById` (not raw `openExternal` with unenriched URLs).
