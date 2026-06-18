# Renderer Test Suite

## OVERVIEW

Tests for `src/renderer/` under Vitest with `jsdom` environment. No Electron mocks loaded. DOM rendering exercised via `document.body.innerHTML`. Shared types imported from `src/shared/`.

## FILES

```
tests/renderer/
├── alert.test.ts                  # Alert overlay state machine, formatTimeRange, AlertPayload push
├── apply-events-push.test.ts      # Push event filtering/signature gating
├── delegation.test.ts             # data-action event delegation
├── escape-html.test.ts            # XSS protection (top-level)
├── main-ui.test.ts                # Main popover state machine + meeting list render
├── settings.test.ts               # Settings form auto-save toggles
├── rendering/
│   └── body.test.ts               # Meeting list HTML rendering with escapeHtml + parts.push() pattern
└── utils/
    ├── dom.test.ts                # DOM helpers (queries, classlist, structure assertions)
    ├── escape-html.test.ts        # escapeHtml unit test (lower-level)
    ├── result.test.ts             # Result<T,E> unwrapping helpers
    └── time.test.ts               # Time formatting utilities
```

There is no `rendering/dom.test.ts` and no `utils/errors.test.ts` — error message helpers live under `tests/shared/errors.test.ts`.

## CONVENTIONS

- `jsdom` environment: render via `document.body.innerHTML = html`, assert on `document.body.textContent`
- `escapeHtml()` tested for `&`, `<`, `>`, `"`, `'` escaping
- State machine tests: assert `loading` → `no-permission` / `events` transitions
- `window.api` stubbed via `Object.defineProperty(window, 'api', {...})` — match exact callback signatures from `src/preload/index.ts`
- `onEventsUpdated` callback receives `MeetingEvent[]` directly (no extra round-trip)
- Meeting list rendering: `parts.push()` + `.join('')` pattern, never `html += ...`
- Branded fixtures (`EventId`, `MeetUrl`, `IsoUtc`) come from `tests/helpers/test-utils.ts` (`asTestEventId`, `asTestMeetUrl`, `asTestIsoUtc`) — never assign raw strings

## ANTI-PATTERNS

- Never pass unescaped user content to `innerHTML`
- Never use dot notation on index-signature types in tests
- Never mock `window.api` with wrong callback signatures
- Never import from `src/main/` — renderer tests must stay process-pure
