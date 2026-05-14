# Shared Test Suite

## OVERVIEW

Tests for `src/shared/` modules. Vitest project `shared`, Node environment, **no Electron mocks**, no jsdom. Source files under `src/shared/` are consumed by main, preload, and renderer alike, so they must stay free of process-specific globals — and so do their tests.

## FILES

```
tests/shared/
├── errors.test.ts        # AppError discriminated union, errFrom(), formatAppError(),
│                         # the isXxx type guards, and SwiftHelperError.toAppError()
└── parse-json.test.ts    # parseJsonObject(): JSON parse + validator integration,
                          # error mapping into AppResult<T> via the validation kind
```

## CONVENTIONS

- Import from `../../src/shared/...` only — no `src/main/`, `src/renderer/`, or `src/preload/` imports here. The one exception is `errors.test.ts`, which imports `SwiftHelperError` from `src/main/swift/event-validator.js` to verify the `toAppError()` bridge; keep that the only cross-process import in the project.
- All fallible APIs return `Result<T, E>` / `AppResult<T> = Result<T, AppError>`. Tests assert on the `ok` discriminant (`if (result.ok) { ... } else { ... }`) — no `try/catch` around pure functions.
- `AppError` is a tagged union with `kind: "swift-permission-denied" | "swift-no-calendars" | "swift-runtime" | "validation" | "io" | "unknown"`. Use the `isXxx` predicates (`isSwiftPermissionDenied`, `isValidationError`, …) rather than ad-hoc shape checks.
- `parseJsonObject(json, label, validator)` always returns `AppResult<T>`; tests cover three failure modes (`SyntaxError` → `validation`, non-object root → `validation` with `"Expected JSON object"`, validator-returned `err`) and the success path.
- Fixtures stay inline; this project does not depend on `tests/helpers/test-utils.ts`. If a future shared test needs branded fixtures, pull `asTestEventId` / `asTestMeetUrl` / `asTestIsoUtc` from there — those helpers are themselves shared-only.

## ANTI-PATTERNS

- Never import `electron`, `node:fs`, `node:child_process`, or any main-process module.
- Never load `tests/setup.main.ts` from this project — it is gated to the `main` workspace.
- Never duck-type errors with `"error" in result`; always narrow on `result.ok` and `error.kind`.
- Keep shared tests deterministic; pin time only when the shared utility itself is time-dependent.
