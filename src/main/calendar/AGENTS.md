# calendar/ — Provider abstraction

**Parent:** `src/main/AGENTS.md`

Platform calendar backends behind a stable domain facade (`domain/calendar.ts`).

## FILES

| File | Role |
| --- | --- |
| `provider.ts` | `CalendarProvider` interface + id union |
| `factory.ts` | `getActiveCalendarProvider()`, `resetCalendarProvider()`; Darwin clamp |
| `clean-description.ts` | Pure notes cleaner (shared by EventKit parse + future cloud) |
| `providers/darwin-eventkit.ts` | Swift EventKit + AppleScript (Darwin only; static-imports `swift/*`) |
| `providers/stub-unsupported.ts` | Non-Darwin placeholder until Google (Wave 4) |

## RULES

- Production code outside `providers/darwin-eventkit.ts` and `src/main/swift/**` must not import `swift/*`.
- Factory uses **dynamic import** for Darwin so win32 bundles never load Swift.
- Callers use `domain/calendar.ts` only — not factory/providers directly (except tests).
- `utils/platform.ts` is meeting-host detection; OS checks use `platform/os.ts`.
