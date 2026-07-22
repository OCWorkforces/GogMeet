# Test Helpers

## OVERVIEW

`tests/helpers/test-utils.ts` is the single source of shared factories and brand validators used across the `main`, `renderer`, and `shared` Vitest projects. It has no test-runner-specific imports (no `vi`, no `expect`), so it is safe to import from any project.

Import path convention from test files (note `.js` extension even for `.ts` source — matches project ESM resolution):

```typescript
import { createMockEvent, asTestEventId } from "../helpers/test-utils.js";
```

## EXPORTED HELPERS

| Helper                | Signature                                                                 | Purpose                                                                                |
| --------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `createMockEvent`     | `(overrides?: Partial<MeetingEvent>) => MeetingEvent`                     | Fully-formed `MeetingEvent`. Defaults: id `"test-id"`, start `+5m`, end `+35m`, canonical Meet URL, calendar `"Work"`, `isAllDay: false`, `userEmail: "user@example.com"`. |
| `createMockSettings`  | `(overrides?: Partial<AppSettings>) => AppSettings`                       | `AppSettings` derived from `DEFAULT_SETTINGS` with shallow overrides.                  |
| `createMockIpcEvent`  | `(sender?: Partial<WebContents>) => IpcMainInvokeEvent`                   | Minimal `IpcMainInvokeEvent` with a `file:///app/index.html` sender. Use `sender` overrides to swap `getURL`, `isDestroyed`, `send` for `validateSender()` cases.        |
| `isoFromNow`          | `(minutes: number, now?: number) => string`                               | ISO-8601 UTC timestamp `minutes` minutes from `now` (defaults to `Date.now()`). Accepts negatives for past times. |
| `asTestEventId`       | `(raw: string) => EventId`                                                | Throwing wrapper around `asEventId` from `src/shared/brand.js`.                        |
| `asTestIsoUtc`        | `(raw: string) => IsoUtc`                                                 | Throwing wrapper around `asIsoUtc`.                                                    |
| `asTestMeetUrl`       | `(raw: string) => MeetUrl`                                                | Throwing wrapper around `asMeetUrl`.                                                   |

## CONTRACTS

- **Throw-on-invalid branding.** `asTestEventId` / `asTestIsoUtc` / `asTestMeetUrl` call the underlying `Result<T,string>` validator via the internal `unwrapBrand()` and **throw** on `ok === false`. Use these only for known-good fixtures; tests that need to assert validation failure should call `asEventId` / `asIsoUtc` / `asMeetUrl` from `src/shared/brand.js` directly and inspect the `Result`.
- **Defaults are stable.** `createMockEvent`'s defaults match the convention legacy `makeEvent` factories converged on. If you need a different shape, pass `overrides` instead of mutating the helper — production code may rely on the existing defaults across many suites.
- **Defaults are time-relative.** `createMockEvent()` calls `isoFromNow()` at invocation time, so each call produces fresh timestamps. Combine with `vi.useFakeTimers()` + `vi.setSystemTime()` for deterministic windows.
- **Sender mocks are shallow.** `createMockIpcEvent({ getURL: () => "https://evil.example" })` only overrides the methods you supply. Production code touches `sender.getURL`, `sender.isDestroyed`, and `sender.send`; everything else is structurally cast through `unknown`.
- **No Electron at import time.** The file imports types from `electron` (`IpcMainInvokeEvent`, `WebContents`) but never the runtime — safe to import from `tests/shared/*` and `tests/renderer/*`.

## LEGACY FACTORIES

Older suites still ship per-file factories rather than these helpers:

| Per-file factory  | Where                     | Notes                                                                |
| ----------------- | ------------------------- | -------------------------------------------------------------------- |
| `makeEvent`       | scheduler-* tests          | Equivalent to `createMockEvent`; new tests should prefer the helper. |
| `makeSwiftLine`   | `swift/event-parser.test.ts` | Produces a nine-string JSON Lines calendar record fixture; no shared replacement yet. |

When extending an existing suite, match the surrounding style; when starting a new test file, use the helpers above.
