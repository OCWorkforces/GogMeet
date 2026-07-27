# Tray Context Menu

Builds Electron `MenuItemConstructorOptions[]` for the tray icon. Pure builder — no `Menu` lifecycle, no IPC ownership (tray owns install/popup). No direct imports of join-meeting or scheduler facades.

## FILES

| File | Role |
| --- | --- |
| `meeting-menu.ts` | `buildMeetingMenuTemplate`, `buildCalendarTrayMenuTemplate`, `MenuCallbacks` |

## CONTRACT

### `MenuCallbacks`

| Callback | Required | Typical wiring |
| --- | --- | --- |
| `onAbout` | yes | About window |
| `onOpenSettings` | yes | Settings window |
| `onJoinMeeting(id)` | yes | `graph.join.byId` |
| `onForcePoll()` | yes | `graph.scheduler.forcePoll` |
| `onConnectGoogle` | optional | `graph.calendar.requestPermission` then forcePoll |
| `onDisconnectGoogle` | optional | `graph.calendar.disconnect` |
| `onRetryPoll` | optional | forcePoll |

### `buildMeetingMenuTemplate(events, showTomorrow, callbacks, status?)`

- Filters all-day / ended events; Today / Tomorrow groups.
- Meetings with URLs use a **submenu**: Join (`onJoinMeeting`) + Copy Link (`clipboard` + `buildMeetUrl`).
- Footer: Join Next Meeting (`pickJoinTarget` + `onJoinMeeting`), Refresh (`onForcePoll`), Settings…, About, Quit.
- `status: CalendarStatus` — optional last poll status from `facades/calendar-status.ts`.

### `buildCalendarTrayMenuTemplate(ui, showTomorrow, callbacks, status?)`

- Input: `CalendarUiState` (permission, phase, errors, events, offline, oauthConfigured).
- **Windows / non-Darwin:** Connect / Reconnect / Disconnect Google, error + Retry, offline hint.
- **Darwin:** meeting list when granted; uses same meeting rows + footer.

## CONSUMERS

`tray.ts` takes `AppGraph` in `setupTray(win, graph)`, builds menus from UI state + cached meetings, refreshes on `meeting-list-updated` and `calendar-status-updated`. Installs with `setContextMenu()`; on Windows left-click also `popUpContextMenu`.

## ANTI-PATTERNS

- Do not mutate `events` / `ui` arrays.
- Do not call `Menu.buildFromTemplate` here — tray owns lifecycle.
- Do not import `utils/join-meeting` or `scheduler/facade` — use callbacks.
- Do not open meetings with raw `shell.openExternal`.
