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

- Filters all-day / ended events via domain `filterUpcomingMeetings` / `isMeetingInProgress`; Today / Tomorrow groups.
- “In progress” requires `start ≤ now < end` (not merely start ≤ now).
- Meetings with URLs use a **submenu**: Join (`onJoinMeeting`) + Copy Link (`clipboard` + `buildMeetUrl`).
- Footer: Join Next Meeting (`pickJoinTarget` + `onJoinMeeting`), Refresh (`onForcePoll`), Settings…, About, Quit.
- `status: CalendarStatus` — optional last poll status from `facades/calendar-status.ts`.

### `buildCalendarTrayMenuTemplate(ui, showTomorrow, callbacks, status?)`

- Input: `CalendarUiState` (permission, phase, errors, events, offline, oauthConfigured, `cacheAgeMs`).
- **Windows / non-Darwin:** Connect / Reconnect / Disconnect Google, error + Retry, offline hint.
- **Darwin:** meeting list when granted; uses same meeting rows + footer.
- **`phase === "limited"`:** show limited copy under meeting rows (partial live refresh).
- **`offline`:** “Offline — showing last synced meetings” when events present.

## CONSUMERS

`tray.ts` takes `AppGraph` in `setupTray(win, graph)`, builds menus from UI state + cached meetings, refreshes on `meeting-list-updated`, `calendar-status-updated`, and display-horizon ticks. Menu signature includes **upcoming** (wall-clock filtered) membership so ended meetings invalidate the cached menu without calendar content changes. Installs with `setContextMenu()`; on Windows left-click rebuilds from cache then `popUpContextMenu`.

## ANTI-PATTERNS

- Do not mutate `events` / `ui` arrays.
- Do not call `Menu.buildFromTemplate` here — tray owns lifecycle.
- Do not import `utils/join-meeting` or `scheduler/facade` — use callbacks.
- Do not open meetings with raw `shell.openExternal`.
