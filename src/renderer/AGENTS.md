# Renderer Layer

## OVERVIEW

Vanilla TypeScript UI for 3 BrowserWindow contexts. No framework; HTML string templates with `escapeHtml()`. Shared types from `../shared/`.

Primary meeting list UX for users is the **native tray menu**; the main BrowserWindow (popover entry) may stay hidden while still receiving pushes for height/list experiments.

## ENTRY POINTS

| Entry | HTML | Window | Role |
|-------|------|--------|------|
| `index.ts` | `index.html` | list window (often `show: false`) | Meeting list state machine, Join by event id, refresh |
| `settings/index.ts` | `settings/index.html` | Settings (Dock-visible) | Schema v2 toggles, auto-save |
| `alert/index.ts` | `alert/index.html` | Full-screen overlay | Alert payload display; Dismiss + Join |

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

- Open-before select: **0–10** minutes (`0` = “At start”)
- Toggles: launch at login, show tomorrow, window alert, **auto-open**, **OS notifications**, **quiet hours**
- Auto-save via `settings.set`; copy must not claim alerts fire “at start” (they fire before auto-open)

## ALERT WINDOW

- Payload: `AlertPayload` with optional `hasMeetUrl` / `autoOpenAt` — **no meetUrl string**
- Join button when `hasMeetUrl` → `app.joinMeeting(id)` then dismiss
- Dismiss → `alert.notifyDismissed(id)` (cancels pending auto-open)
- Escape dismisses

## CONVENTIONS / ANTI-PATTERNS

- Always `escapeHtml` user content in templates
- Never put meeting URLs in alert payloads or join buttons as openable strings
- Full re-render on state change; no cross-render DOM refs
