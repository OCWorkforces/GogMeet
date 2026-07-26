# calendar/ — Provider abstraction

**Parent:** `src/main/AGENTS.md`

Platform calendar backends behind the stable domain facade (`domain/calendar.ts`).

## FILES

| File | Role |
| --- | --- |
| `provider.ts` | `CalendarProvider` interface + id union |
| `factory.ts` | `getActiveCalendarProvider()`, `resetCalendarProvider()` — selection order below |
| `clean-description.ts` | Pure notes cleaner (EventKit parse + Google) |
| `url-extract.ts` | Pure Meet/Zoom/Calendly extract (Zoom → Meet → Calendly) |
| `offline-cache.ts` | Encrypted `userData/calendar-cache.enc` offline fallback |
| `auth/google-client-id.ts` | `GOOGLE_OAUTH_CLIENT_ID` |
| `auth/google-token-store.ts` | Encrypted `userData/calendar-auth/google.enc` (schema + clientId gates) |
| `auth/google-oauth.ts` | PKCE loopback on `127.0.0.1`, single-flight refresh |
| `providers/darwin-eventkit.ts` | Swift EventKit + AppleScript (static `swift/*` OK here only) |
| `providers/google-calendar.ts` | Google Calendar API provider (Windows MVP) |
| `providers/fixture-calendar.ts` | Dev JSON fixture |
| `providers/stub-unsupported.ts` | Placeholder (factory no longer selects it for normal Windows) |

## Factory selection order

1. Unpackaged **and** `GOGMEET_CALENDAR_FIXTURE` set → fixture  
2. Darwin → EventKit (always; ignores cloud provider settings for MVP)  
3. Else → Google Calendar  

## RULES

- Production code outside `providers/darwin-eventkit.ts` and `src/main/swift/**` must not import `swift/*`.
- Darwin provider is **dynamic-import**ed so win32 never loads Swift.
- Cloud providers emit `MeetingEvent[]` directly (not JSON Lines).
- Use `extractMeetingUrl` / `cleanDescription` for free-text fields; never reimplement host allowlists ad hoc.
- Callers (scheduler, IPC, tray) use **`domain/calendar.ts` only**.
- `utils/platform.ts` = meeting host; `platform/os.ts` = OS.
- Fixture never loads when `app.isPackaged`.
- OAuth: loopback only; fail closed if `safeStorage` unavailable unless unpackaged `GOGMEET_ALLOW_PLAINTEXT_TOKENS=1`.
