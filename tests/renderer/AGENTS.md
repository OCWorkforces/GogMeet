# Renderer Test Suite

## OVERVIEW

Tests for `src/renderer/` (6 main files, ~45K). Uses Vitest with `jsdom` environment. DOM rendering via `document.body.innerHTML`. Shared types imported from `src/shared/`.

## FILES

| File                  | Size   | What It Tests
| --------------------- | ------ | ----------------------------------------------
| `alert.test.ts`       | 13.6K  | Alert window state machine, AlertPayload push
| `main-ui.test.ts`     | 15.6K  | Main popover state machine, meeting list render
| `delegation.test.ts`  | 2.9K   | `data-action` event delegation
| `escape-html.test.ts` | 2.3K   | HTML escaping for XSS protection
| `settings.test.ts`   | 3.2K   | Settings window toggle auto-save

## RENDERING SUBCOMPONENTS

```
tests/renderer/
├── rendering/
│   ├── body.test.ts     # 13.3K, meeting list DOM rendering with escapeHtml
│   └── dom.test.ts      # 2.2K, DOM structure assertions
│
└── utils/
    ├── result.test.ts         # Result<T,E> unwrapping
    ├── time.test.ts           # Time formatting utilities
    └── errors.test.ts         # Error message formatting
```

## CONVENTIONS

- `jsdom` environment: render via `document.body.innerHTML = html`, assert on `document.body.textContent`
- `escapeHtml()` tested for `&`, `<`, `>`, `"`, `'` escaping
- State machine tests: assert `loading` → `no-permission` transitions
- `window.api` stubbed via `Object.defineProperty(window, 'api', {...})`
- `onEventsUpdated` callback receives `MeetingEvent[]` directly (no extra round-trip)
- Meeting list rendering: `parts.push()` + `.join('')` pattern, not `html +=`

## ANTI-PATTERNS

- Never pass unescaped user content to `innerHTML`
- Never use dot notation on index-signature types in tests
- Never mock `window.api` with wrong callback signatures


