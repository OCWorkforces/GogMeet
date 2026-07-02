# Renderer Layer

## OVERVIEW

Vanilla TypeScript UI for 3 BrowserWindow contexts. No framework, innerHTML string templates with `escapeHtml()` for XSS protection. Shared types imported from `../shared/` (AppState, AlertPayload, branded types).

## ENTRY POINTS

| Entry | HTML | Window | Role |
|-------|------|--------|------|
| `index.ts` | `index.html` | 360×480 popover | Meeting list, state machine, push updates, manual refresh |
| `settings/index.ts` | `settings/index.html` | Settings (Dock-visible) | iOS toggles, auto-save with "✓ Saved" indicator |
| `alert/index.ts` | `alert/index.html` | Full-screen overlay | Dark overlay, fade+zoom animations, `alert:show` push channel |

## STRUCTURE

```
src/renderer/
├── index.ts          # Main popover UI
├── events/           # data-action event delegation
├── lib/              # pure event-push filtering/signature helpers
├── rendering/        # body renderer
├── settings/         # Settings window entry
├── alert/            # Full-screen alert entry
├── styles/           # CSS reset + popover styles
└── utils/            # DOM query helpers shared by renderer entries/delegation
```

## RENDERING

- `rendering/body.ts` owns meeting list, permission/error/empty states, and all user content via `escapeHtml()`.
- `index.ts` owns the outer dialog/footer; `body.ts` owns body states/list only.
- Title, description, URL: always escaped before innerHTML

## EVENT HANDLING

- `events/delegation.ts`, `data-action` attribute delegation on `#app`
- Actions: `refresh`, `retry`, `grant-access`, `join-meeting`

## STATE MACHINE (index.ts)

`AppState` is defined in `src/shared/app-state.ts` and imported by both `index.ts` and `rendering/body.ts`. No longer duplicated. States: `loading` → `no-permission` → `no-events` → `has-events` → `error`

- `loadEvents()` fetches via `window.api.calendar.getEvents()` (reads cache; used after `CALENDAR_EVENTS_UPDATED` push delivers `MeetingEvent[]` directly via `onEventsUpdated(callback: (events: MeetingEvent[]) => void)` typed callback)
- `window.api.scheduler.forcePoll()` — fires `scheduler:force-poll` IPC (fire-and-forget); refresh/retry buttons call this instead of `loadEvents()` directly
- Visibility-aware: refreshes on show when stale; push updates arrive through `onEventsUpdated()`.
- `lastPollTime = Date.now()` prevents redundant fetch on first show

## SETTINGS WINDOW

- Auto-save: toggle change → `window.api.settings.set()` → "✓ Saved" indicator
- `setupToggleListener(toggleId, settingKey, indicatorId)` wires each toggle and closes over `saveIndicatorTimers`
- `saveIndicatorTimers` Map cleaned on re-render, prevents leaks
- Save failure reverts toggle + shows error message

## ALERT WINDOW

- Triggered by `window.api.alert.onShowAlert()` push channel; callback receives `AlertPayload` (from `shared/alert.ts`), not raw MeetingEvent.
- Shows meeting title, time, description (all escaped)
- Title uses `-webkit-line-clamp: 2` with `overflow-wrap: anywhere` — allows up to 2 lines, no truncation for long/Vietnamese titles
- Keyboard: Escape dismisses; non-Escape keys do not dismiss.
- Error boundary: try/catch around rendering with fallback DOM

## CONVENTIONS

- Never use innerHTML with user content without `escapeHtml()`
- All UI is string template concatenation, no framework
- `data-action` event delegation, no inline handlers
- State changes trigger full re-render, no diffing
- Popover CSS lives in `styles/`; settings and alert use entry-local `styles.css` imported by their entry points
- DOM element casts (`as HTMLElement`) are accepted for freshly queried elements in vanilla TS.
- `RendererState.version` starts empty and is populated from `window.api.app.getVersion()` during init.
- `window.api` is typed in `env.d.ts` via `import type { Api } from "../preload/index.js"`.
- `onEventsUpdated(callback: (events: MeetingEvent[]) => void)` receives pushed event arrays directly.

## ANTI-PATTERNS

- Never bypass `escapeHtml()` for any user-controlled string in innerHTML
- Never store DOM references across renders, full re-render replaces innerHTML
- Never use `onclick` inline handlers, use `data-action` delegation
