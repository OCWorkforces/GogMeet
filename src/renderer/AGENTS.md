# Renderer Layer

## OVERVIEW

Vanilla TypeScript UI for 3 BrowserWindow contexts. No framework, innerHTML string templates with `escapeHtml()` for XSS protection. Shared types imported from `../shared/` (AppState, AlertPayload, branded types).

## ENTRY POINTS

| Entry | HTML | Window | Role |
|-------|------|--------|------|
| `index.ts` | `index.html` | 360×480 popover | Meeting list, state machine, 5-min auto-refresh |
| `settings/index.ts` | `settings/index.html` | Settings (Dock-visible) | iOS toggles, auto-save with "✓ Saved" indicator |
| `alert/index.ts` | `alert/index.html` | Full-screen overlay | Dark overlay, fade+zoom animations, `alert:show` push channel |

## STRUCTURE

```
src/renderer/
├── index.ts          # Main popover UI
├── events/           # data-action event delegation
├── rendering/        # body / header / footer renderers
├── settings/         # Settings window entry
├── alert/            # Full-screen alert entry
└── styles/           # CSS reset + popover styles
```

## RENDERING

- `rendering/body.ts`, meeting list, all user content via `escapeHtml()`
- `rendering/header.ts`, header with calendar name
- `rendering/footer.ts`, last-updated timestamp + refresh icon
- Title, description, URL: always escaped before innerHTML

## EVENT HANDLING

- `events/delegate.ts`, `data-action` attribute delegation on `#app`
- Actions: `join-meeting`, `grant-access`, `open-settings`

## STATE MACHINE (index.ts)

`AppState` is defined in `src/shared/app-state.ts` and imported by both `index.ts` and `rendering/body.ts`. No longer duplicated. States: `loading` → `no-permission` → `no-events` → `has-events` → `error`

- `loadEvents()` fetches via `window.api.calendar.getEvents()`
- Visibility-aware: pauses refresh when hidden, resumes on show
- `lastPollTime = Date.now()` prevents redundant fetch on first show

## SETTINGS WINDOW

- Auto-save: toggle change → `window.api.settings.set()` → "✓ Saved" indicator
- `setupToggleListener(key, checkbox, indicator, saveIndicatorTimers)` generic for all toggles
- `saveIndicatorTimers` Map cleaned on re-render, prevents leaks
- Save failure reverts toggle + shows error message

## ALERT WINDOW

- Triggered by `window.api.alert.onShowAlert()` push channel; callback receives `AlertPayload` (from `shared/alert.ts`), not raw MeetingEvent. Returns cleanup function `() => void`.
- Shows meeting title, time, description (all escaped)
- Title uses `-webkit-line-clamp: 2` with `overflow-wrap: anywhere` — allows up to 2 lines, no truncation for long/Vietnamese titles
- Keyboard: Escape or any key dismisses
- Error boundary: try/catch around rendering with fallback DOM

## CONVENTIONS

- Never use innerHTML with user content without `escapeHtml()`
- All UI is string template concatenation, no framework
- `data-action` event delegation, no inline handlers
- State changes trigger full re-render, no diffing
- CSS lives in `styles/`, loaded via HTML link
- DOM element casts (`as HTMLElement`) are accepted pattern for vanilla TS, documented with comments at each site (5 locations)
- `version` in index.ts is `let` (reassigned on line 165), not `const`

## ANTI-PATTERNS

- Never bypass `escapeHtml()` for any user-controlled string in innerHTML
- Never store DOM references across renders, full re-render replaces innerHTML
- Never use `onclick` inline handlers, use `data-action` delegation
- All user-facing string fields (title, calendarName, description, meetUrl) arrive as branded types from shared but are string-compatible for rendering
