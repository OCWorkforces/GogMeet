# Renderer Test Suite

## OVERVIEW

Tests for `src/renderer/` under Vitest with `jsdom` environment. No Electron mocks. DOM rendering via `document.body.innerHTML`. Types from `src/shared/` and `src/domain/`.

## FILES

```text
tests/renderer/
├── alert.test.ts / alert-join.test.ts   # Alert overlay + join-by-id
├── apply-events-push.test.ts            # Push event filtering/signature gating
├── delegation.test.ts                   # data-action (join uses data-event-id)
├── escape-html.test.ts                  # shared escapeHtml under jsdom
├── main-ui.test.ts                      # List window state machine + render + completed-history timer
├── main-coverage.test.ts                # Extra list-window coverage paths
├── settings.test.ts                     # Full schema v3 UI: timing fields, dependents, connect/disconnect, auto-save
├── rendering/body.test.ts               # Meeting list HTML; completed-today rows; title truncate; Join uses data-event-id
└── utils/
    ├── dom.test.ts                      # true renderer util (src/renderer/utils/dom.ts)
    ├── escape-html.test.ts              # shared escapeHtml retest (not renderer-local)
    ├── result.test.ts                   # domain Result retest under jsdom
    └── time.test.ts                     # domain time helpers retest under jsdom
```

## CONVENTIONS

- `jsdom`: render via `document.body.innerHTML`, assert on `textContent` / query selectors.
- `window.api` stubbed via `Object.defineProperty(window, 'api', {...})` — match `src/preload/index.ts` signatures.
- `onResultUpdated` receives `CalendarPublication` (`{ publicationGeneration, result }`).
- Branded fixtures from `tests/helpers/test-utils.ts`; calendar `getEvents` mocks return publications with exhaustive provenance (`source` / `completeness` / timestamps) or `okCalendarResult` inside `result`.
- Cast helper installed via `setup.as.ts` — prefer `.As<T>()`.
- Meeting list: `parts.push()` + `.join('')`, never `html += ...`.
- Settings: assert control **ids** (not hybrid switch ARIA); cover connect→disconnect round-trip; open-before options 0–10; dependent disable when auto-open off; alert-lead / late-join saves. Brand aurora is pure shared CSS/HTML (unit-tested under `tests/shared/`); settings suite focuses on form wiring.

## ANTI-PATTERNS

- Never pass unescaped user content to `innerHTML`.
- Never use dot notation on index-signature types in tests.
- Never mock `window.api` with wrong callback signatures.
- Never import from `src/main/` — renderer tests stay process-pure.
