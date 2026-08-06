# Renderer Layer

## OVERVIEW

Vanilla TypeScript UI for three BrowserWindow contexts. No framework; HTML string templates with `escapeHtml()`. Types from `../shared/` and `../domain/`.

Primary meeting list UX for users is the **native tray menu**; the main BrowserWindow (popover entry) may stay hidden while still receiving pushes for height/list experiments.

## ENTRY POINTS

| Entry | HTML | Window | Role |
| --- | --- | --- | --- |
| `index.ts` | `index.html` | 360×480 popover | Meeting list, state machine, push updates, manual refresh |
| `settings/index.ts` | `settings/index.html` | Settings 520×760, canvas `#0d1117` (Dock on macOS) | Full schema v3 prefs + calendar connect; auto-save |
| `alert/index.ts` | `alert/index.html` | Full-screen overlay | Dark overlay, fade+zoom; `alert:show` push |

## STRUCTURE

```text
src/renderer/
├── index.ts / index.html     # List UI entry (popover)
├── env.d.ts / css.d.ts       # ambient Api + CSS/SVG module typings
├── tsconfig.json
├── events/                   # data-action event delegation
├── lib/apply-events-push.ts  # tomorrow filter + content/display signature gate for pushes
├── rendering/body.ts         # meeting list HTML
├── settings/                 # Settings window (index.html/ts/css + env.d.ts)
├── alert/                    # Full-screen alert (index.html/ts/css)
├── styles/                   # CSS reset + list styles
└── utils/dom.ts              # DOM query helpers only (escapeHtml is shared)
```

## LIST WINDOW

- `AppState` lives in `src/shared/app-state.ts` and is imported by `index.ts` and `rendering/body.ts`.
- Discriminated union (not a linear pipeline): `loading` \| `no-permission` \| `no-events` \| `has-events` \| `error`. Tray/settings phases `limited` / `offline-cached` are **`CalendarUiPhase`**, not popover `AppState`.
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

- Visual system: System Settings–inspired **grouped inset lists** on fixed product canvas **`#0d1117`** (groups `#161b22`); dark `color-scheme`; prefers-contrast / reduced-motion.
- Brand mark: 72px app icon with aurora under the title bar (`.settings-brand`); imports `about-icon.svg` + injects `APP_ICON_AURORA_CSS` once (`#app-icon-aurora-styles`). Uses shared **base** aurora tier (calmer than About/Update fancy). Same helper powers About (96px) and Update (88px) with `.app-icon-aurora--about`.
- Sections: **Calendar** · **Joining Meetings** · **Tray Menu** · **General** (`settings/index.ts` + `settings/styles.css`).
- Calendar: `getUiState` / `requestPermission` / `disconnect`; `escapeHtml` for email + lastError + save errors; status dot + Connect/Disconnect/Reconnect.
- Prefs auto-save: toggle / select / time → `window.api.settings.set()` → "Saved" (concurrent saves coalesced).
- Joining fields: `autoOpenEnabled`, `openBeforeMinutes` (0–10), `windowAlert` (Meeting Alert), `alertLeadSeconds`, `nativeNotifications`, `lateJoinGraceMinutes`, `quietHoursEnabled` + `quietHoursStart`/`End` (`HH:mm`). Dependents disable when Auto-Open / Meeting Alert / Quiet Hours are off.
- Toggles use native checkboxes (styled track); no hybrid `role="switch"`.
- Save failure reverts toggle + shows escaped error (`role="alert"`).
- Hide-cache soft-refresh: `visibilitychange` → re-`get()` settings + calendar UI; `settings.onChanged` re-renders when idle.
- Tray Menu: tomorrow + completed history (display-only completed rebuilds tray without scheduler restart).

## ALERT WINDOW

- Payload: `AlertPayload` with optional `hasMeetUrl` / `autoOpenAt` — **no meetUrl string**.
- Join when `hasMeetUrl` → `app.joinMeeting(id)` then dismiss.
- Dismiss → `alert.notifyDismissed(id)` (cancels pending auto-open).
- Escape dismisses.
- Main reuses a hidden BrowserWindow across presentations (see `main/windows/AGENTS.md`); renderer still fully re-renders from each `ALERT_SHOW` push.

## CONVENTIONS / ANTI-PATTERNS

- Always `escapeHtml` user content in templates (including completed-history titles). Import from **`shared/utils/escape-html.js`** (not a renderer-local util).
- Never put meeting URLs in alert payloads or join buttons as openable strings.
- Full re-render on state change; no cross-render DOM refs.
- Never import from `src/main/`.
- Do not drive completed-history invalidation via calendar poll — use the local presentation timer + settings push + horizon pushes.
