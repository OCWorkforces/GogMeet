# Main Utils — Process Utilities

**Parent:** `src/main/AGENTS.md`

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `browser-window.ts` | BrowserWindow config factory, CSP enforcement (typed via `CSPSource`/`CSPDirectiveName`/`CSPDirective`/`CSP` template literal types) | `SECURE_WEB_PREFERENCES`, `getPreloadPath()`, `loadWindowContent()`, `setupCspHeaders()`, `_resetCspForTest()` |
| `url-validation.ts` | URL allowlist + hostname-based validation (Google Meet, Zoom, Calendly) | `MEETING_URL_ALLOWLIST`, `isAllowedMeetUrl()`, `validateMeetUrl()` → `Result<MeetUrl, string>` |
| `meet-url.ts` | Multi-platform meeting URL builder + shell opener | `buildMeetUrl()`, `openMeetingUrl()` |
| `platform.ts` | Meeting platform detection (Google Meet vs Zoom) | `detectPlatform()` → `"google-meet" \| "zoom" \| undefined` |
| `packageInfo.ts` | Lazy-load + cache `package.json` with runtime validation | `getPackageInfo()`, `clearPackageInfoCache()`, `isPackageInfoLoaded()`, `PackageInfo` |

## PATTERNS

- **`loadWindowContent(win, page)`** — only function that handles both dev (Vite `localhost:5173/{page}.html`) and prod (packaged `{renderer}/{page}.html`) loading; no other caller should branch on dev/prod directly
- **CSP singleton** — `browser-window.ts` uses a module-level `cspHeadersConfigured` flag; `_resetCspForTest()` resets it for tests
- **CSP template literal types** — `browser-window.ts` defines `CSPSource`, `CSPDirectiveName`, `CSPDirective`, and `CSP` template literal types for compile-time Content-Security-Policy validation
- **`ALLOWED_HOSTNAMES`** in `url-validation.ts` — derived at module load from `MEETING_URL_ALLOWLIST` via `new URL(prefix).hostname`; never hard-coded separately
- **`packageInfo.ts` uses `readFileSync`** — only sync file I/O in the main process; acceptable because it's a one-time lazy load at startup, result is frozen (`Object.freeze`)
- **`validateMeetUrl()`** returns `Result<MeetUrl, string>` — prefer this over `isAllowedMeetUrl()` when you need the branded type back
- **`buildMeetUrl()` identity params** — uses `URL.searchParams.set()` for the identity hint (`authuser` for Google Meet, `uname` for Zoom). This replaces any existing duplicates and preserves the URL fragment. Do not return to manual `?`/`&` string concatenation; that path produced duplicate keys and dropped fragments.

## ANTI-PATTERNS

- Never call `loadWindowContent` with raw URL strings — use the `page` parameter
- Never hard-code `localhost:5173` elsewhere — only `browser-window.ts` knows the dev server address
- Never use `isAllowedMeetUrl()` for URL validation before `shell.openExternal()` — use `validateMeetUrl()` + check result
- Never duplicate the allowlist — `MEETING_URL_ALLOWLIST` in `url-validation.ts` is the single source
- Calendly meeting URLs (`https://calendly.com/`) are supported. The browser handles the 302 redirect to the underlying Meet room transparently; the main process performs no redirect resolution.
