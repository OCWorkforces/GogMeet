# calendar/ — Provider abstraction

**Parent:** `src/main/AGENTS.md`

Platform calendar backends behind the stable calendar facade (`facades/calendar.ts`). Pure URL extract / description clean live in `src/domain/services/`.

## FILES

| File | Role |
| --- | --- |
| `provider.ts` | `CalendarProvider` interface + id union (aligns with CalendarPort capabilities) |
| `factory.ts` | `getActiveCalendarProvider()`, `resetCalendarProvider()` — selection order below |
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

## DOMAIN HELPERS (not in this folder)

| Concern | Path |
| --- | --- |
| Free-text URL extract | `domain/services/url-extract.ts` |
| Notes cleaner | `domain/services/clean-description.ts` |
| buildMeetUrl / host detect | `domain/services/build-meet-url.ts`, `platform.ts` |

## RULES

- Production code outside `providers/darwin-eventkit.ts` and `src/main/swift/**` must not import `swift/*`.
- Darwin provider is **dynamic-import**ed so win32 never loads Swift.
- Cloud providers emit `MeetingEvent[]` directly (not JSON Lines).
- Use domain `extractMeetingUrl` / `cleanDescription` (`domain/services/*`) for free-text fields; never reimplement host allowlists ad hoc.
- Callers (scheduler, IPC, tray) use **`facades/calendar.ts`** or **`graph.calendar`** only.
- OS branching: `platform/os.ts`. Meeting host: `domain/services/platform.ts`.
- Fixture never loads when `app.isPackaged`.
- OAuth: loopback only; fail closed if `safeStorage` unavailable unless unpackaged `GOGMEET_ALLOW_PLAINTEXT_TOKENS=1`.
- Auth modules are imported only from the Google provider (and tests) — never from facades.
