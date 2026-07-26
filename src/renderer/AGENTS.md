# Renderer Layer

## OVERVIEW

Vanilla TypeScript UI for 3 BrowserWindow contexts. No framework; HTML string templates with `escapeHtml()`. Shared types from `../shared/`.

Primary meeting list UX for users is the **native tray menu**; the main BrowserWindow (popover entry) may stay hidden while still receiving pushes for height/list experiments.

## ENTRY POINTS

| Entry | HTML | Window | Role |
|-------|------|--------|------|
| `index.ts` | `index.html` | 360×480 popover | Meeting list, state machine, push updates, manual refresh |
| `settings/index.ts` | `settings/index.html` | Settings (Dock-visible on macOS) | Meeting prefs + **Google Calendar account** (connect/disconnect); auto-save |
| `alert/index.ts` | `alert/index.html` | Full-screen overlay | Dark overlay, fade+zoom animations, `alert:show` push channel |
| `settings/index.ts` | `settings/index.html` | Settings (Dock-visible) | Schema v2 toggles, auto-save |

## STRUCTURE

```
src/renderer/
├── index.ts          # List UI entry
├── events/           # data-action event delegation
├── lib/              # pure event-push filtering/signature helpers
├── rendering/        # body renderer
├── settings/         # Settings window entry
├── alert/            # Full-screen alert entry
├── styles/           # CSS reset + list styles
└── utils/            # DOM query helpers
```

## EVENT HANDLING

- `events/delegation.ts` on `#app` with `data-action`
- Actions: `refresh`, `retry`, `grant-access`, `join-meeting` (uses **`data-event-id`**, not raw URL)
- Join → `window.api.app.joinMeeting(eventId)`

## SETTINGS WINDOW (schema v2)

`AppState` is defined in `src/shared/app-state.ts` and imported by both `index.ts` and `rendering/body.ts`. No longer duplicated. States: `loading` → `no-permission` → `no-events` → `has-events` → `error`

- `loadEvents()` fetches cached events via `window.api.calendar.getEvents()`; pushes deliver `MeetingEvent[]` directly through `onEventsUpdated(callback: (events: MeetingEvent[]) => void)`.
- `window.api.scheduler.forcePoll()` — fires `scheduler:force-poll` IPC (fire-and-forget); refresh/retry buttons call this instead of `loadEvents()` directly
- Visibility-aware: refreshes on show when stale; push updates arrive through `onEventsUpdated()`.
- `lastPollTime = Date.now()` prevents redundant fetch on first show

## SETTINGS WINDOW

- Google Calendar section: `calendar.getUiState()` / `requestPermission` / `disconnect`; escape email and lastError.
- Meeting prefs auto-save: toggle → `window.api.settings.set()` → "✓ Saved" indicator.
- `setupToggleListener(toggleId, settingKey, indicatorId)` wires each toggle; `saveIndicatorTimers` cleaned on re-render.
- Save failure reverts toggle + shows error message.

## ALERT WINDOW

- Payload: `AlertPayload` with optional `hasMeetUrl` / `autoOpenAt` — **no meetUrl string**
- Join button when `hasMeetUrl` → `app.joinMeeting(id)` then dismiss
- Dismiss → `alert.notifyDismissed(id)` (cancels pending auto-open)
- Escape dismisses

## CONVENTIONS / ANTI-PATTERNS

- Always `escapeHtml` user content in templates
- Never put meeting URLs in alert payloads or join buttons as openable strings
- Full re-render on state change; no cross-render DOM refs
