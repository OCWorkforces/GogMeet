# Tray Context Menu

Builds Electron `MenuItemConstructorOptions[]` for the tray icon. Pure builder — no `Menu` lifecycle, no IPC ownership (tray owns install/popup).

## FILES

| File | Role |
| --- | --- |
| `meeting-menu.ts` | `buildMeetingMenuTemplate`, `buildCalendarTrayMenuTemplate` |

## CONTRACT

### `buildMeetingMenuTemplate(events, showTomorrow, callbacks)`

- Filters all-day / ended events; Today / Tomorrow groups; open via `buildMeetUrl` + `openMeetingUrl`.
- Footer: Settings… / About / Quit (`CommandOrControl+Q`).
- `status: CalendarStatus` — optional last poll status from `domain/calendar-status.ts`.

### `buildCalendarTrayMenuTemplate(ui, showTomorrow, callbacks)`

- Input: `CalendarUiState` (permission, phase, errors, events, offline, oauthConfigured).
- **Windows / non-Darwin:** Connect / Reconnect / Disconnect Google, error + Retry, offline hint, Outlook-coming-later copy.
- **Darwin:** meeting list when granted; uses same meeting rows + footer.
- Callbacks: `onAbout`, `onOpenSettings`, optional `onConnectGoogle`, `onDisconnectGoogle`, `onRetryPoll`.

## CONSUMERS

`tray.ts` builds from UI state + cached meetings; refreshes on `meeting-list-updated` and `calendar-status-updated`. Installs with `setContextMenu()`; on Windows left-click also `popUpContextMenu`.

## ANTI-PATTERNS

- Do not mutate `events` / `ui` arrays.
- Do not call `Menu.buildFromTemplate` here — tray owns lifecycle.
- Do not `shell.openExternal` for meetings — use `openMeetingUrl`.
- Do not import scheduler internals.
- Meetings with URLs use a **submenu**: Join (`joinMeetingById`) + Copy Link (`clipboard` + `buildMeetUrl`). No direct `openMeetingUrl` from top-level click.
- Footer actions: **Join Next Meeting** (`pickJoinTarget` + `joinMeetingById`), **Refresh** (`forcePoll`), Settings…, About, Quit.
- Do not open meetings with raw `shell.openExternal` — Join always through `joinMeetingById`.
