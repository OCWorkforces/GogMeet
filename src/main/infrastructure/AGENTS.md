# infrastructure/

## OVERVIEW

Driven adapters implementing application ports.

| Path | Implements |
| --- | --- |
| `settings/json-settings-store.ts` | `SettingsStorePort` — JSON under `userData`, schema v2 migrate/rewrite |
| `electron/shell-meeting-opener.ts` | `MeetingOpenerPort` — allowlisted `shell.openExternal` |

Calendar providers remain under `src/main/calendar/` and satisfy `CalendarPort` methods via the facade adapter (not a separate infra class).

## RULES

- May use Electron, Node FS, network, Swift.
- Must not be imported by pure `src/domain/` or `application/use-cases` (only composition/facades/utils thin wrappers wire them).
- Prefer importing `createShellMeetingOpener` / `createJsonSettingsStore` from composition or facades — not re-exported from utils.
