# infrastructure/

## OVERVIEW

Driven adapters implementing application ports. Calendar backends (Google OAuth, sync tokens, offline cache, EventKit) live under `src/main/calendar/`, not here.

| Path | Implements |
| --- | --- |
| `settings/json-settings-store.ts` | `SettingsStorePort` — JSON under `userData`, schema **v3** migrate/rewrite (incl. `showCompletedTodayMeetings`) |
| `electron/shell-meeting-opener.ts` | `MeetingOpenerPort` — allowlisted `shell.openExternal` via domain `validateMeetUrl` |

Calendar providers satisfy `CalendarPort` methods via the facade adapter (not a separate infra class).

## RULES

- May use Electron, Node FS, network, Swift.
- Must not be imported by pure `src/domain/` or `application/use-cases` (only composition/facades/utils thin wrappers wire them).
- Prefer importing `createShellMeetingOpener` / `createJsonSettingsStore` from composition or facades — not re-exported from utils.
- Tests: `tests/main/json-settings-store.test.ts`, `tests/main/shell-meeting-opener.test.ts`.
