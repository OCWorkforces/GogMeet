# Renderer Layer

## OVERVIEW

Vanilla TypeScript UI for three BrowserWindow contexts. No framework; HTML string templates with `escapeHtml()`. Types from `../shared/` and `../domain/`.

Primary meeting list UX for users is the **native tray menu**; the main BrowserWindow (popover entry) may stay hidden while still receiving pushes for height/list experiments.

## ENTRY POINTS

| Entry | HTML | Window | Role |
| --- | --- | --- | --- |
| `index.ts` | `index.html` | 360×480 popover | Meeting list, state machine, push updates, manual refresh |
| `settings/index.ts` | `settings/index.html` | Settings (Dock-visible on macOS) | Meeting prefs + Google account connect/disconnect; auto-save |
| `alert/index.ts` | `alert/index.html` | Full-screen overlay | Dark overlay, fade+zoom; `alert:show` push |

## STRUCTURE

```text
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

## LIST WINDOW

- `AppState` lives in `src/shared/app-state.ts` and is imported by `index.ts` and `rendering/body.ts`.
- States: `loading` → `no-permission` → `no-events` → `has-events` → `error`.
- `loadEvents()` uses `window.api.calendar.getEvents()` → `CalendarPublication`; pushes deliver the same envelope via `onResultUpdated`.
- Refresh/retry use the same `loadEvents()` path (no renderer force-poll IPC). `loadGeneration` ignores stale publications.
- On show: always local `render()` with `Date.now()` so ended meetings drop immediately; network refresh is debounced separately (`lastPollTime` ≥5s).
- Soft labels / end membership while open are refreshed by main display-horizon pushes (`CALENDAR_RESULT_UPDATED`), not a renderer interval.
- List filter / “In progress” use domain `meeting-time` helpers (`end > now`, `start ≤ now < end`).
- **Title display:** visible meeting titles use domain `truncateMiddle` with `MEETING_TITLE_DISPLAY_MAX_CHARS` (**25**, middle `…`). Full title stays on the span `title` tooltip and Join `aria-label`. Escape **after** truncate. CSS `.meeting-title` uses `min-width: 0` so flex cannot widen the 360px window.
- **Completed today** (when `settings.showCompletedTodayMeetings`): after actionable rows, muted non-interactive history via `filterCompletedTodayMeetings` (same-local-day, newest-ended first). Renderer owns a presentation timer for the next event end or local midnight — re-render/re-arm only; no calendar/settings/join IPC.
- `SETTINGS_CHANGED` for only the history toggle re-renders/re-arms without a full refresh path used for timing keys.

## EVENT HANDLING

- `events/delegation.ts` on `#app` with `data-action`.
- Actions: `refresh`, `retry`, `grant-access`, `join-meeting` (uses **`data-event-id`**, not raw URL).
- Join → `window.api.app.joinMeeting(eventId)`.
- Completed history rows have **no** `data-action` / event id / join control.

## SETTINGS WINDOW (schema v3)

- Google Calendar section: `calendar.getUiState()` / `requestPermission` / `disconnect`; escape email and lastError.
- Meeting prefs auto-save: toggle → `window.api.settings.set()` → "✓ Saved" indicator.
- `setupToggleListener(toggleId, settingKey, indicatorId)` wires each toggle; clear timers on re-render.
- Save failure reverts toggle + shows error.
- Timing fields include `openBeforeMinutes` (0–10), `autoOpenEnabled`, `alertLeadSeconds`, quiet hours, `nativeNotifications`, `lateJoinGraceMinutes`, `showTomorrowMeetings`, `launchAtLogin`.
- Display toggle: **Show completed meetings** → `showCompletedTodayMeetings` (default off). Display-only — main rebuilds tray without scheduler restart/poll; popover re-renders on push.

## ALERT WINDOW

- Payload: `AlertPayload` with optional `hasMeetUrl` / `autoOpenAt` — **no meetUrl string**.
- Join when `hasMeetUrl` → `app.joinMeeting(id)` then dismiss.
- Dismiss → `alert.notifyDismissed(id)` (cancels pending auto-open).
- Escape dismisses.
- Main reuses a hidden BrowserWindow across presentations (see `main/windows/AGENTS.md`); renderer still fully re-renders from each `ALERT_SHOW` push.

## CONVENTIONS / ANTI-PATTERNS

- Always `escapeHtml` user content in templates (including completed-history titles).
- Never put meeting URLs in alert payloads or join buttons as openable strings.
- Full re-render on state change; no cross-render DOM refs.
- Never import from `src/main/`.
- Do not drive completed-history invalidation via calendar poll — use the local presentation timer + settings push + horizon pushes.
