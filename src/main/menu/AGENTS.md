# Tray Context Menu

Builds the Electron `MenuItemConstructorOptions[]` template shown when the user right-clicks (or invokes) the tray icon. Pure builder — no Electron `Menu` lifecycle, no state, no IPC.

## FILES

| File              | Role                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `meeting-menu.ts` | `buildMeetingMenuTemplate(events, showTomorrow, callbacks)` — Today / Tomorrow groups, footer |

## CONTRACT

Input:
- `events: MeetingEvent[]` — full upcoming list from latest poll (filtered internally).
- `showTomorrowMeetings: boolean` — from `settings.showTomorrowMeetings`.
- `callbacks: { onAbout, onOpenSettings }` — invoked on click.

Output: `MenuItemConstructorOptions[]` ready for `Menu.buildFromTemplate()`.

## BEHAVIOR

- Filters out all-day events and events whose `endDate` is in the past.
- Groups by `Today` (`startOfDay` ≤ start < `startOfTomorrow`) and `Tomorrow` (`startOfTomorrow` ≤ start < day-after-tomorrow).
- "In progress" suffix when `startDate <= now`.
- Items without `meetUrl` are rendered disabled (no `click` handler).
- Click handler builds the URL via `utils/meet-url.ts:buildMeetUrl()` and opens via `openMeetingUrl()` (allowlisted).
- Empty state: shows "No upcoming meetings" with the standard footer.
- Always appends footer: Settings… / About GogMeet / Quit (Cmd+Q → `app.quit()`).

## CONSUMERS

`tray.ts` calls `buildMeetingMenuTemplate()` whenever the meeting list changes (via `mainBus.on("meeting-list-updated", ...)`) or settings change.

## ANTI-PATTERNS

- Do not mutate `events` — caller owns the array.
- Do not call `shell.openExternal()` directly — always go through `openMeetingUrl()` (URL allowlist).
- Do not import from `scheduler/` — menu is a presentation leaf.
