# domain/ (pure)

## OVERVIEW

**Pure** domain layer. Zero Electron, `node:fs`, network, or Swift process dependencies. Enforced by `eslint-plugin-boundaries` and Vitest project `domain` (high coverage floors).

## STRUCTURE

```text
src/domain/
├── entities/    # brands, MeetingEvent, CalendarResult, CalendarUiState,
│                # settings, Result, AppError, parse-json, type-guards
├── policies/    # meet URL allowlist + hostname helpers
└── services/    # buildMeetUrl, validateMeetUrl, url-extract, cleanDescription,
                 # pickJoinTarget, event-signature, time, settings-parse, platform
```

## FILES (entities)

| File | Role |
| --- | --- |
| `brand.ts` | `EventId`, `MeetUrl`, `IsoUtc`, `WindowHeight` + validators |
| `meeting-event.ts` | `MeetingEvent` shape |
| `calendar-result.ts` | Exhaustive `CalendarResult` + permission + helpers (see below) |
| `calendar-ui-state.ts` | tray/settings UI state, phases, `cacheAgeMs`, defaults |
| `settings.ts` | `AppSettings`, `DEFAULT_SETTINGS`, quiet hours types |
| `result.ts` | `Result<T,E>`, `ok` / `err` |
| `errors.ts` | `AppError` taxonomy |
| `parse-json.ts` | `parseJsonObject` → `AppResult` |
| `type-guards.ts` | `isObjectRecord` |

## Calendar fetch contract

Success is **exhaustive** (no optional provenance for callers to guess):

| Variant | Shape |
| --- | --- |
| Live complete | `{ kind:"ok"; source:"live"; completeness:"complete"; observedAt; events }` |
| Live partial | `{ kind:"ok"; source:"live"; completeness:"partial"; observedAt; events }` |
| Offline cache | `{ kind:"ok"; source:"offline-cache"; observedAt; cachedAt; events }` |
| Error | `{ kind:"err"; error; code }` |

| Helper | Role |
| --- | --- |
| `isCalendarOk` | any success |
| `isCalendarLiveOk` / `isCalendarOfflineOk` | source narrow |
| `isCalendarAutomationEligible` | **live complete only** — intended gate for auto-open/alert/title |
| `calendarLiveOk` / `calendarOfflineOk` / `calendarErr` | constructors |
| `isValidCalendarTimestamp` | finite, ≤5 min future skew |

**UI (`calendar-ui-state.ts`):** phases include `limited` (live partial) and `offline-cached`. Field `cacheAgeMs` for offline age. Copy: `CALENDAR_LIMITED_COPY`. Offline success must **not** set permission from `kind==="ok"` alone.

## FILES (services / policies)

| File | Role |
| --- | --- |
| `policies/meet-url-allowlist.ts` | HTTPS host allowlist + `isAllowedMeetHostname` |
| `services/url-validation.ts` | `validateMeetUrl` / `isAllowedMeetUrl` |
| `services/build-meet-url.ts` | pure join URL + Meet `authuser` / Zoom `uname` |
| `services/url-extract.ts` | free-text Zoom → Meet → Calendly extract |
| `services/clean-description.ts` | notes cleaner for EventKit/Google |
| `services/pick-join-target.ts` | next joinable meeting |
| `services/platform.ts` | Meet vs Zoom host detection (**not** OS) |
| `services/time.ts` | day boundaries + remaining-time format |
| `services/settings-parse.ts` | clamp/migrate settings blobs |
| `services/event-signature.ts` | stable event/list signatures for push gating |

## RULES

- Import only other `src/domain/**` modules.
- Callers: `src/shared` (IPC maps), main/preload/renderer, tests.
- **No** barrels and **no** re-exports from old `shared/*` or `main/utils` paths.
- Opening meeting URLs (`shell.openExternal`) stays in infrastructure / `main/utils/meet-url.ts`.
- Prefer constructors/helpers over ad-hoc result object literals.

## WHERE TO LOOK

| Concern | Path |
| --- | --- |
| Brands / validators | `entities/brand.ts` |
| Result provenance / automation eligibility | `entities/calendar-result.ts` |
| UI phase / offline age | `entities/calendar-ui-state.ts` |
| Settings schema + quiet hours | `entities/settings.ts` |
| Settings parse/clamp | `services/settings-parse.ts` |
| Allowlist + validateMeetUrl | `policies/meet-url-allowlist.ts`, `services/url-validation.ts` |
| buildMeetUrl (pure) | `services/build-meet-url.ts` |
| URL extract / clean notes | `services/url-extract.ts`, `services/clean-description.ts` |
