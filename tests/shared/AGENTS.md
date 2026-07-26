# Shared Test Suite

## OVERVIEW

Tests for `src/shared/` modules. Vitest project `shared`, Node environment, **no Electron mocks**, no jsdom. Source files under `src/shared/` are consumed by main, preload, and renderer alike, so they must stay free of process-specific globals — and so do their tests.

## FILES

```
tests/shared/
├── errors.test.ts        # AppError discriminated union, errFrom(), formatAppError(),
│                         # the isXxx type guards, and SwiftHelperError.toAppError()
├── event-signature.test.ts # stable event/list signature fields and ordering
└── parse-json.test.ts    # parseJsonObject(): JSON parse + validator integration,
                          # error mapping into AppResult<T> via the validation kind
```

## CONVENTIONS

- Import from `../../src/shared/...` by default. The documented exception is `errors.test.ts`, which imports `SwiftHelperError` from `src/main/swift/event-validator.js` to verify the `toAppError()` bridge.
- All fallible APIs return `Result<T, E>` / `AppResult<T> = Result<T, AppError>`. Tests assert on the `ok` discriminant (`if (result.ok) { ... } else { ... }`) — no `try/catch` around pure functions.
- `AppError` is a tagged union with calendar (`calendar-permission-denied` | `calendar-no-calendars` | `calendar-runtime` | `calendar-auth` | `calendar-network`), `validation`, `io`, and `unknown` kinds. Use `isCalendarPermissionDenied`, `isValidationError`, … rather than ad-hoc shape checks.
- `parseJsonObject(json, label, validator)` always returns `AppResult<T>`; tests cover three failure modes (`SyntaxError` → `validation`, non-object root → `validation` with `"Expected JSON object"`, validator-returned `err`) and the success path.
- Fixtures may stay inline; branded fixtures can use `tests/helpers/test-utils.ts` wrappers such as `asTestEventId`.

## ANTI-PATTERNS

- Never import `electron`, Node process modules, or arbitrary main-process modules; keep the documented `SwiftHelperError` bridge exception isolated.
- Never load `tests/setup.main.ts` from this project — it is gated to the `main` workspace.
- Never duck-type errors with `"error" in result`; always narrow on `result.ok` and `error.kind`.
- Keep shared tests deterministic; pin time only when the shared utility itself is time-dependent.
