# calendar/ — Provider abstraction

**Parent:** `src/main/AGENTS.md`

Platform calendar backends behind the stable calendar facade (`facades/calendar.ts`). Pure URL extract / description clean live in `src/domain/services/`.

## FILES

| File | Role |
| --- | --- |
| `provider.ts` | `CalendarProvider` + id union; **`getEvents(signal: AbortSignal)`** |
| `factory.ts` | `getActiveCalendarProvider()`, `resetCalendarProvider()` — selection order below |
| `google-http.ts` | Bounded Google transport: 15s deadline, 8 MiB body, poll budget 60s, typed redacted errors |
| `offline-cache.ts` | Encrypted `userData/calendar-cache.enc` — **current** schema `{savedAt, events}` (unversioned) |
| `auth/google-client-id.ts` | `GOOGLE_OAUTH_CLIENT_ID` |
| `auth/google-token-store.ts` | Encrypted `userData/calendar-auth/google.enc`; **preserve ciphertext** on load failures |
| `auth/google-oauth.ts` | PKCE loopback; `refreshGoogleAccessToken("if-needed"\|"force")`; clear only on definitive invalidation |
| `providers/darwin-eventkit.ts` | Swift EventKit + AppleScript (static `swift/*` OK here only); partial when parse diagnostics |
| `providers/google-calendar.ts` | Google API; live complete/partial; cache write **complete only**; offline ok on network fail |
| `providers/fixture-calendar.ts` | Dev JSON fixture (live complete) |
| `providers/stub-unsupported.ts` | Placeholder (factory no longer selects it for normal Windows) |

## Factory selection order

1. Unpackaged **and** `GOGMEET_CALENDAR_FIXTURE` set → fixture  
2. Darwin → EventKit (always; ignores cloud provider settings for MVP)  
3. Else → Google Calendar  

## Result provenance (producers)

| Provider | Live complete | Live partial | Offline |
| --- | --- | --- | --- |
| Darwin | clean parse | any parse diagnostic | n/a |
| Google | all selected calendars traversed | ≥1 success + any fail | encrypted cache on network/transient |
| Fixture | always | — | — |

Use domain helpers: `calendarLiveOk`, `calendarOfflineOk`, `calendarErr`.

## OAuth / credentials

- Refresh modes: **`if-needed`** (skip network if fresh) vs **`force`** (always network; used after API 401).
- Clear tokens only for `invalid_grant` / `invalid_token` or second API 401 after a real force refresh.
- Transient failures (timeout, network, 429, 5xx, storage, config) **preserve** encrypted credentials.
- Token load never unlinks ciphertext for decrypt/malformed/schema/client/secure-storage failures.

## Offline cache (current vs planned)

| Current | Planned (perf plan) |
| --- | --- |
| `{ savedAt, events }` | versioned v1 + `observedAt` / `cachedAt` |
| Google writes only when live **complete** | same; reject corrupt/future metadata |
| Offline success is display/join data | + scheduler must not automate partial/offline |

## DOMAIN HELPERS (not in this folder)

| Concern | Path |
| --- | --- |
| Free-text URL extract | `domain/services/url-extract.ts` |
| Notes cleaner | `domain/services/clean-description.ts` |
| buildMeetUrl / host detect | `domain/services/build-meet-url.ts`, `platform.ts` |
| Result ADT | `domain/entities/calendar-result.ts` |

## RULES

- Production code outside `providers/darwin-eventkit.ts` and `src/main/swift/**` must not import `swift/*`.
- Darwin provider is **dynamic-import**ed so win32 never loads Swift.
- Cloud providers emit `MeetingEvent[]` / domain `CalendarResult` (not JSON Lines).
- Honor `AbortSignal` on every network/helper call path.
- Use domain `extractMeetingUrl` / `cleanDescription`; never reimplement host allowlists ad hoc.
- Callers (scheduler, IPC, tray) use **`facades/calendar.ts`** or **`graph.calendar`** only.
- OS branching: `platform/os.ts`. Meeting host: `domain/services/platform.ts`.
- Fixture never loads when `app.isPackaged`.
- OAuth: loopback only; fail closed if `safeStorage` unavailable unless unpackaged `GOGMEET_ALLOW_PLAINTEXT_TOKENS=1`.
- Auth modules are imported only from the Google provider (and tests) — never from facades.
