# Tray Context Menu

Builds the Electron `MenuItemConstructorOptions[]` template installed on the macOS tray icon. Pure builder for structure — click handlers call join/settings helpers. No Menu lifecycle ownership (that is `tray.ts`).

## FILES

| File              | Role                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `meeting-menu.ts` | `buildMeetingMenuTemplate(events, showTomorrow, callbacks, status?)` — day groups + actions   |

## CONTRACT

Input:
- `events: MeetingEvent[]` — full upcoming list from latest poll (filtered internally).
- `showTomorrowMeetings: boolean` — from `settings.showTomorrowMeetings`.
- `callbacks: { onAbout, onOpenSettings }` — invoked on click.
- `status: CalendarStatus` — optional last poll status from `domain/calendar-status.ts`.

Output: `MenuItemConstructorOptions[]` ready for `Menu.buildFromTemplate()`.

## BEHAVIOR

- Optional leading **status rows** for permission-denied (with Open Calendar Privacy Settings via `openSystemSettings`), no-calendars, or runtime errors.
- Filters out all-day events and events whose `endDate` is in the past.
- Groups by Today / Tomorrow.
- Meetings with URLs use a **submenu**: Join (`joinMeetingById`) + Copy Link (`clipboard` + `buildMeetUrl`). No direct `openMeetingUrl` from top-level click.
- Items without `meetUrl` are disabled.
- Footer actions: **Join Next Meeting** (`pickJoinTarget` + `joinMeetingById`), **Refresh** (`forcePoll`), Settings…, About, Quit.

## CONSUMERS

`tray.ts` installs the menu during setup and rebuilds on `meeting-list-updated` with `getLastCalendarStatus()`.

## ANTI-PATTERNS

- Do not mutate `events`.
- Do not own Electron `Menu` lifecycle — `tray.ts` installs with `setContextMenu` before first click.
- Do not open meetings with raw `shell.openExternal` — Join always through `joinMeetingById`.
- Do not import scheduler internals; `forcePoll` via `scheduler/facade.js` only is allowed for Refresh.
