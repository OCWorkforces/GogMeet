# infrastructure/

## OVERVIEW

Driven adapters implementing application ports.

| Path | Implements |
| --- | --- |
| `settings/json-settings-store.ts` | SettingsStorePort |
| `electron/shell-meeting-opener.ts` | MeetingOpenerPort |

Calendar providers remain under `src/main/calendar/` and implement CalendarPort methods in place.

## RULES

- May use Electron, Node FS, network, Swift.
- Must not be imported by pure `src/domain/` or `application/use-cases` (only composition/facades wire them).
