# Renderer Process — UI Layer

Electron renderer (web context). Vanilla TypeScript UI with native macOS popover aesthetic. No framework. Three separate entry points built by Rsbuild.

## FILES

| File                   | Role                                                  |
| ---------------------- | ----------------------------------------------------- |
| `index.ts`             | Main popover UI, state machine, event handlers        |
| `index.html`           | CSP-protected HTML template                           |
| `env.d.ts`             | TypeScript declarations                               |
| `css.d.ts`             | CSS module declarations                               |
| `events/`              | Event handling (extracted)                            |
| `events/delegation.ts` | `setupDelegatedEvents()` via `data-action` attributes |
| `rendering/`           | UI rendering (extracted)                              |
| `rendering/body.ts`    | `renderBody()` for all states, `formatRelativeTime()` |
| `styles/reset.css`     | Shared CSS reset, variables, dark mode, font stack    |
| `styles/main.css`      | Popover-specific styles                               |
| `settings/`            | Settings window UI (separate entry)                   |
| `settings/index.ts`    | Settings form logic, save indicator                   |
| `settings/index.html`  | Settings HTML template                                |
| `settings/styles.css`  | iOS-style toggles                                     |
| `alert/`               | Full-screen meeting alert (separate entry)            |
| `alert/index.ts`       | Alert overlay logic (Escape dismisses)                |
| `alert/index.html`     | Alert HTML template                                   |
| `alert/styles.css`     | Dark full-screen styles with animations               |

## STATE MACHINE (main popover)

```typescript
// index.ts:10
type AppState =
  | { type: "loading" }
  | { type: "no-permission"; retrying: boolean }
  | { type: "no-events" }
  | { type: "has-events"; events: MeetingEvent[] }
  | { type: "error"; message: string };
```

## RENDERING PATTERN

- No virtual DOM — direct `innerHTML` assignment to `#app`
- Template literal functions: `render()` (index.ts), `renderBody()` (rendering/body.ts), `renderFooter()` (index.ts)
- Event binding: delegated listener on `#app` container via `data-action` attributes (events/delegation.ts)
- All 3 entries use same pattern: `#app` container + `innerHTML` + `DOMContentLoaded` init

## EVENT DELEGATION (main + alert)

Main popover and alert use `data-action` attributes:

- Main: `data-action="refresh"`, `data-action="grant-access"`, `data-action="join-meeting"`, `data-action="retry"`
- Alert: `data-action="dismiss"`
- Settings uses direct per-element listeners instead (no delegation)

## AUTO-REFRESH

- Interval: 5 minutes (`REFRESH_INTERVAL_MS`)
- Timer stored in `refreshTimer`, cleared on re-init
- Pauses when window hidden, resumes on visibility change

## API ACCESS

```typescript
window.api.calendar.getEvents(); // → CalendarResult
window.api.calendar.requestPermission(); // → CalendarPermission
window.api.calendar.getPermissionStatus(); // → CalendarPermission
window.api.window.setHeight(height); // → void
window.api.app.openExternal(url); // → void
window.api.app.getVersion(); // → string
window.api.settings.get(); // → AppSettings
window.api.settings.set(partial); // → AppSettings
window.api.settings.onChanged(cb); // → void (push listener)
window.api.alert.onShowAlert(cb); // → void (push listener)
```

## CSS CONVENTIONS

- **Shared reset**: `styles/reset.css` defines CSS variables (`--bg`, `--surface`, `--border`, `--text-primary`, etc.), dark mode via `@media (prefers-color-scheme: dark)`, native font stack (`-apple-system, BlinkMacSystemFont, 'SF Pro Text'`)
- **Backdrop blur**: `blur(20px) saturate(180%)` for native macOS aesthetic
- **Dark mode**: Handled via CSS variables override in `reset.css` media query
- **Alert always dark**: `alert/styles.css` overrides variables with hardcoded dark palette
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables all animations

## SECURITY

- CSP in all `index.html`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`
- HTML escaping via `escapeHtml()` for user content (imported from `src/shared/utils/escape-html.ts`)
- Used in main popover and alert renderer (settings doesn't render user text)

## SETTINGS WINDOW

Separate renderer entry at `settings/`. Key differences:

- Uses native window chrome (`titleBarStyle: "hiddenInset"`)
- Shows in Dock when open (tray-only app otherwise)
- Singleton BrowserWindow (focus if already open)
- Auto-saves on dropdown change with "✓ Saved" indicator
- iOS-style toggle switch for "Launch at Login" and "Show Tomorrow" options

## ALERT WINDOW

Full-screen overlay renderer at `alert/`. Triggered by `showAlert()` from main process at `openBeforeMinutes + 1` min before meeting.

- Receives `{ title, meetUrl }` via `ALERT_SHOW` push channel
- Full-screen, frameless, `alwaysOnTop`, dark background (`#1d1d1f`)
- Dismissed by Escape key, "Dismiss" button, or "Join Meeting" button — all trigger `dismissAlert()` with fade+zoom-out animation before `window.close()`
- "Join Meeting" calls `window.api.app.openExternal(url)`
- Singleton — `showAlert()` closes existing alert before showing new one
- Animations: fade+zoom-in (300ms ease-out), fade+zoom-out (250ms ease-in); respects `prefers-reduced-motion`

## TESTS

**Location**: `tests/renderer/*.test.ts` (5 test files)

| File                  | Focus                    |
| --------------------- | ------------------------ |
| `delegation.test.ts`  | Event delegation on #app |
| `escape-html.test.ts` | XSS protection           |
| `main-ui.test.ts`     | Main UI state machine    |
| `alert.test.ts`       | Alert overlay behavior   |
| `settings.test.ts`    | Settings form logic      |
