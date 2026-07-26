# calendar/ — Provider abstraction

**Parent:** `src/main/AGENTS.md`

Platform calendar backends behind a stable domain facade (`domain/calendar.ts`).

## FILES

| File | Role |
| --- | --- |
| `provider.ts` | `CalendarProvider` interface + id union |
| `factory.ts` | `getActiveCalendarProvider()`, `resetCalendarProvider()`; fixture gate + Darwin clamp |
| `clean-description.ts` | Pure notes cleaner (shared by EventKit parse + future cloud) |
| `url-extract.ts` | Pure Meet/Zoom/Calendly URL extraction (Zoom → Meet → Calendly) |
| `providers/darwin-eventkit.ts` | Swift EventKit + AppleScript (Darwin only; static-imports `swift/*`) |
| `providers/stub-unsupported.ts` | Non-Darwin placeholder until Google (Wave 4) |
| `providers/fixture-calendar.ts` | Dev/test JSON fixture provider (unpackaged + env only) |

## RULES

- Production code outside `providers/darwin-eventkit.ts` and `src/main/swift/**` must not import `swift/*`.
- Factory uses **dynamic import** for Darwin so win32 bundles never load Swift.
- Fixture active only when `!app.isPackaged` **and** `GOGMEET_CALENDAR_FIXTURE` is a non-empty path (K23).
- Callers use `domain/calendar.ts` only — not factory/providers directly (except tests).
- `utils/platform.ts` is meeting-host detection; OS checks use `platform/os.ts`.
- Cloud providers (Wave 4+) must use `extractMeetingUrl` / `cleanDescription`, not `swift/*`.
