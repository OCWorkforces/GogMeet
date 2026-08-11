# calendar/ — Provider abstraction

**Parent:** `src/main/AGENTS.md`

Platform calendar backends behind the stable calendar facade (`facades/calendar.ts`). Pure URL extract / description clean live in `src/domain/services/`.

## FILES

| File                                      | Role                                                                                                                                                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider.ts`                             | `CalendarProvider` + id union (`darwin-eventkit` \| `google-calendar` \| reserved `microsoft-graph` \| `fixture` \| `stub-unsupported`); **`getEvents(signal: AbortSignal)`**                                                                 |
| `factory.ts`                              | `getActiveCalendarProvider()`, `resetCalendarProvider()` — selection order below                                                                                                                                                              |
| `refresh-coordinator.ts`                  | Single-flight calendar refresh: one in-flight fetch, at most one queued follow-up, monotonic `publicationGeneration`, lifecycle cancel                                                                                                        |
| `google-http.ts`                          | Bounded Google transport: 15s deadline, 8 MiB body, poll budget 60s, typed redacted errors                                                                                                                                                    |
| `offline-cache.ts`                        | Encrypted `userData/calendar-cache.enc` — schema v1 `{version,observedAt,cachedAt,events}`; rejects legacy/unversioned; filters ended events                                                                                                  |
| `auth/google-client-id.ts`                | `GOOGLE_OAUTH_CLIENT_ID`                                                                                                                                                                                                                      |
| `auth/google-token-store.ts`              | Encrypted `userData/calendar-auth/google.enc`; **preserve ciphertext** on load failures                                                                                                                                                       |
| `auth/google-sync-tokens.ts`              | Encrypted `userData/calendar-auth/google-sync.enc` — schema v1 `{version,tokens}` map of calendarId → opaque `nextSyncToken` (no event bodies)                                                                                                |
| `auth/google-oauth.ts`                    | PKCE loopback; `refreshGoogleAccessToken("if-needed"\|"force")`; clear only on definitive invalidation                                                                                                                                        |
| `providers/darwin-eventkit.ts`            | Swift EventKit + AppleScript (static `swift/*` OK here only); converts parser diagnostics to one safe aggregate, retains valid events, and returns live partial when any line is skipped                                                      |
| `providers/google-calendar.ts`            | Google API; live complete/partial; **incremental sync** + process-local index; **pagination-limit** outcomes (MAX_PAGES=50) discard incomplete chains without mutating index/token; cache write **complete only**; offline ok on network fail |
| `providers/fixture-calendar.ts`           | Dev JSON fixture (live complete); **unpackaged only**                                                                                                                                                                                         |
| `providers/performance-probe-calendar.ts` | Private packaged probe: live complete empty, granted, no watch/I/O; factory only after probe preflight                                                                                                                                        |
| `providers/stub-unsupported.ts`           | Placeholder (factory no longer selects it for normal Windows)                                                                                                                                                                                 |

## Refresh coordinator

Bound from `facades/calendar.ts` via `bindCalendarRefreshFetcher` → get-meetings use case. Scheduler `poll.ts` and graph `calendar.getEvents` share it. Waiters on an in-flight chain all resolve to the final publication of that chain. Envelope: domain `CalendarPublication` (`publicationGeneration` + `CalendarResult`).

| Layer          | API                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinator    | `requestCalendarRefresh()`, `getLastCalendarPublication()`, `cancelCalendarRefresh()`, `bindCalendarRefreshFetcher`                                                                                               |
| Facade aliases | `refreshCalendarPublication()` → request; `getLastPublication()`; `cancelActiveCalendarRefresh()` → cancel; also `getCalendarEventsResult()`, `getCalendarPort()`, permission/UI/warmup/disconnect/report helpers |
| Cancel path    | `stopScheduler` / `restartScheduler` always call `cancelCalendarRefresh()`; waiters reject once (`CalendarRefreshCancelledError`); aborts active provider call                                                    |

Tests: `tests/main/calendar-refresh-coordinator.test.ts`.

## Factory selection order

1. Non-empty `GOGMEET_PERF_PROBE` → **preflight** (packaged + `GOGMEET_PERF_TRACE=1` + isolated `gogmeet-perf-probe-` userData under tmpdir). Pass → `performance-probe-calendar`. **Fail → throw** (never fall through to EventKit/Google/fixture).
2. Unpackaged **and** `GOGMEET_CALENDAR_FIXTURE` set → fixture
3. Darwin → EventKit (always; ignores cloud provider settings for MVP)
4. Else → Google Calendar

## Result provenance (producers)

| Provider          | Live complete                                                                                                      | Live partial                                                                                    | Offline                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Darwin            | clean parse                                                                                                        | any parse diagnostic                                                                            | n/a                                                                                  |
| Google            | all selected calendars **and** calendar-list fully traversed (no page-cap remainder; no mid-chain malformed pages) | ≥1 complete calendar + any fail **or** calendar-list/event `pagination-limit` (incl. multi-cal) | valid encrypted cache on network/transient failure; otherwise existing runtime error |
| Fixture           | always                                                                                                             | —                                                                                               | —                                                                                    |
| Performance probe | empty live complete                                                                                                | —                                                                                               | —                                                                                    |

Use domain helpers: `calendarLiveOk`, `calendarOfflineOk`, `calendarErr`.

## Darwin partial diagnostics

`parseEvents` keeps per-line diagnostics internal, then `aggregateParseDiagnostics` reduces them to the six-number `DarwinPartialRefreshDiagnostics` value: `total`, `malformedRecord`, `malformedFieldCount`, `invalidIso`, `invalidId`, and `duplicateUid`. The Darwin provider calls that helper once per helper result. When the total is positive, it returns the retained valid events as live partial and emits one `console.warn(summary)`.

- Clean Darwin and Google results carry no aggregate. Google partials remain generic.
- Calendar UI state receives the aggregate only for a Darwin live partial and clears it for every other result.
- The aggregate contains counts only. Do not publish raw records, field values, or line numbers.
- Parser diagnostics do not trigger a fetch retry or Swift recompile. Keep the existing integrity-only recompile and process bounds unchanged.

## Google pagination bounds (`MAX_PAGES = 50`)

Internal traversal outcomes are `complete` \| `pagination-limit` (not part of public `CalendarResult`):

| Loop                      | On `pagination-limit`                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `calendarList`            | Return IDs discovered so far + incomplete marker; still fetch every known calendar; aggregate **partial** when ≥1 calendar completes; zero completes → existing error/offline path. Malformed mid-chain (`items` not array after IDs already collected) is incomplete, not complete. |
| Full `events.list`        | Discard that calendar's partial batch; **do not** replace process-local index or persist `nextSyncToken`. Malformed mid-chain with partial events → incomplete.                                                                                                                      |
| Incremental `events.list` | Apply **no** upserts/deletes; preserve existing index + stored token                                                                                                                                                                                                                 |

Individually complete calendars may still commit their own `nextSyncToken` when the calendar-list traversal is partial (or when a sibling calendar hits pagination-limit). Aggregate offline cache remains **live complete only**.

## OAuth / credentials

- Refresh modes: **`if-needed`** (skip network if fresh) vs **`force`** (always network; used after API 401).
- Clear tokens only for `invalid_grant` / `invalid_token` or second API 401 after a real force refresh.
- Transient failures (timeout, network, 429, 5xx, storage, config) **preserve** encrypted credentials. Incremental **429** is not mapped to auth and does not full-retry the same poll.
- Token load never unlinks ciphertext for decrypt/malformed/schema/client/secure-storage failures.

## Offline cache

| Rule   | Detail                                                                                  |
| ------ | --------------------------------------------------------------------------------------- |
| Schema | v1 only: `{ version:1, observedAt, cachedAt, events }`                                  |
| Write  | Callers write **live complete** snapshots only (`saveOfflineCache(events, observedAt)`) |
| Load   | Reject unversioned/legacy/unknown version / non-finite / >5 min future timestamps       |
| Filter | Drop `endDate <= now` on load; empty list remains valid offline hit                     |
| Use    | Display + explicit join; never drives automation                                        |

## Incremental sync (Google only — ADR 0002)

| Rule                     | Detail                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens                   | Opaque `nextSyncToken` per calendar in `google-sync.enc` (encrypted when `safeStorage` available)                                                  |
| Index                    | Process-local `workingEventsByCalendar` — **not** a durable event DB; cold process always full-window fetches                                      |
| Happy path               | After successful full window list, persist token when present; later polls may `events.list?syncToken=` and merge upserts/deletes                  |
| 410 Gone                 | Clear that calendar's token + index entry, then full-window fetch                                                                                  |
| Pagination limit         | Incomplete page chains never commit token/index mutations; do not clear a valid prior token/index                                                  |
| HTTP **429**             | Distinct `RateLimitError` — **no** same-poll full-window fallback after incremental 429; preserve token/index/credentials; no forced OAuth refresh |
| HTTP **5xx** / transport | Incremental may still full-window fallback same poll (unchanged)                                                                                   |
| Disconnect               | `clearAllGoogleSyncTokens` + clear process index                                                                                                   |
| Unchanged                | Offline cache still **live complete only**; automation eligibility still live complete only; no push/webhooks                                      |

## DOMAIN HELPERS (not in this folder)

| Concern                    | Path                                               |
| -------------------------- | -------------------------------------------------- |
| Free-text URL extract      | `domain/services/url-extract.ts`                   |
| Notes cleaner              | `domain/services/clean-description.ts`             |
| buildMeetUrl / host detect | `domain/services/build-meet-url.ts`, `platform.ts` |
| Result ADT                 | `domain/entities/calendar-result.ts`               |

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
