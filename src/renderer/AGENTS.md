# Renderer Process — UI Layer

Electron renderer (web context). Vanilla TypeScript UI with native macOS popover aesthetic. No framework.

## FILES

| File              | Role                                         |
| ----------------- | -------------------------------------------- |
| `index.ts`        | Main UI logic, state machine, event handlers |
| `index.html`      | CSP-protected HTML template                  |
| `env.d.ts`        | TypeScript declarations                      |
| `styles/main.css` | Native macOS styling, dark mode support      |
| `settings/`       | Settings window UI (separate entry)          |
| `settings/index.ts` | Settings form logic, save indicator        |
| `settings/index.html` | Settings HTML template                    |
| `settings/styles.css` | Settings-specific styles (iOS-style toggles) |

## STATE MACHINE

```typescript
// index.ts:5-10
type AppState =
  | { type: "loading" }
  | { type: "no-permission"; retrying: boolean }
  | { type: "no-events" }
  | { type: "has-events"; events: MeetingEvent[] }
  | { type: "error"; message: string };
```

## RENDERING PATTERN

- No virtual DOM — direct `innerHTML` assignment
- Template literal functions: `render()`, `renderBody()`, `renderFooter()`
- Event binding: single delegated listener on `document`, set up once at init

## AUTO-REFRESH

- Interval: 5 minutes (`REFRESH_INTERVAL_MS`)
- Timer stored in `refreshTimer`, cleared on re-init

## API ACCESS

```typescript
window.api.calendar.getEvents(); // → MeetingEvent[]
window.api.calendar.requestPermission(); // → CalendarPermission
window.api.calendar.getPermissionStatus(); // → CalendarPermission
window.api.window.setHeight(height); // → void
window.api.app.openExternal(url); // → void
window.api.app.getVersion(); // → string
window.api.settings.get(); // → AppSettings
window.api.settings.set(partial); // → AppSettings
window.api.settings.onChanged(callback); // → void (listen for changes)
```

## CSS CONVENTIONS

- CSS variables in `:root` for theming
- Dark mode: `@media (prefers-color-scheme: dark)`
- Native fonts: `-apple-system, BlinkMacSystemFont, 'SF Pro Text'`
- Backdrop blur: `blur(20px) saturate(180%)`

## KEY CLASSES

| Class                | Use                                      |
| -------------------- | ---------------------------------------- |
| `.state-screen`      | Loading/empty/error states               |
| `.meeting-item`      | Meeting list row                         |
| `.meeting-meta`      | Flex wrapper for time + badge + cal name |
| `.btn-join`          | Join button (accent color)               |
| `.meeting-time.soon` | Orange "In X min"                        |
| `.meeting-time.now`  | Red "Starting now!"                      |
| `.badge-auto`        | Auto-open indicator (⚡ blue badge)         |
| `.hiding`            | Fade-out animation on close              |

## SECURITY

- CSP in `index.html` + `settings/index.html`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`
- HTML escaping via `escapeHtml()` for user content
- `escapeHtml()` imported from `src/shared/utils/escape-html.ts`

## TESTS

**Location**: `tests/renderer/*.test.ts` (148 lines)

**Delegation tests** (`delegation.test.ts`):
- `[data-action="refresh"]` click handling
- `[data-action="join-meeting"]` URL extraction
- Click outside action elements (no trigger)
- Single listener survives multiple renders

**XSS tests** (`escape-html.test.ts`):
- HTML special chars escaped (`<`, `>`, `&`, `"`, `'`)
- User content safe for innerHTML insertion

## SETTINGS WINDOW

Separate renderer entry at `settings/`. Key differences from main UI:
- Uses native window chrome (`titleBarStyle: "hiddenInset"`)
- Shows in Dock when open (tray-only app otherwise)
- Singleton BrowserWindow (focus if already open)
- Auto-saves on dropdown change with "✓ Saved" indicator
- iOS-style toggle switch for "Launch at Login" and "Show Tomorrow" options
