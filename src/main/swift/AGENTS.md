# Swift — Binary Management & Event Parsing

Manages the Swift EventKit helper binary lifecycle and parses its output into typed data structures.

## FILES

| File                   | Role                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| `binary-manager.ts`    | Orchestration: `ensureBinary()`, `runSwiftHelper()`, re-exports        |
| `binary-cache.ts`      | Cache paths, hash compute/verify, Swift source resolution, secure dir  |
| `binary-compiler.ts`   | swiftc invocation, retry with exponential backoff (5 retries, 1s→30s)  |
| `event-parser.ts`      | `parseEvents()`, `ParseResult`, re-exports from sub-modules            |
| `event-field-parser.ts`| Per-field extractors (uid, title, url, dates, allDay, email, notes)    |
| `event-validator.ts`   | ISO parsing, diagnostics, Swift error classification (`classifySwiftError`) |
| `guards.ts`            | Runtime type guards for Swift output fields, eliminates unsafe `as` casts |
| `calendar-watch-sidecar.ts`| Swift `--watch` mode process manager: spawn, crash recovery (exp backoff, 5 retries), graceful shutdown |

## BINARY LIFECYCLE

```
runSwiftHelper()  →  ensureBinary()  →  binary-cache: check hash
                                      → binary-compiler: compile if needed (5 retries, exp backoff)
                                      → execute binary, verify stdout
```

1. Cache directory created with mode `0o700` (owner-only)
2. Hash stored alongside binary (`source.hash`) — recompiles on source change only
3. Binary hash verified before execution; recompiled on mismatch
4. On compile timeout: SIGTERM → 5s grace → SIGKILL
5. 5 retries with exponential backoff (1s→30s)

### Path Resolution

```
Dev:   lib/main/index.cjs → __dirname → ../../src/main/googlemeet-events.swift
Prod:  process.resourcesPath/app.asar.unpacked/src/main/googlemeet-events.swift
```

**CRITICAL**: `SWIFT_SRC_DEV` uses `../..` (2 levels up from `lib/main/`), NOT `../../..`. The rslib bundler flattens `src/main/swift/` into `lib/main/index.cjs`, reducing directory depth by 1 level.

### Compilation (binary-compiler.ts)

- Architecture-aware target: `arm64-apple-macosx11.0` or `x86_64-apple-macosx11.0`
- Flags: `-Osize -whole-module-optimization`
- Fallback with explicit SDK path for CI environments
- `strip -x -S` removes debug symbols (optional)

## WATCH MODE (calendar-watch-sidecar.ts)

The Swift helper supports a `--watch` mode that runs indefinitely, subscribing to `EKEventStoreChangedNotification` instead of making a one-shot fetch. This replaces the legacy `fs.watch` on `~/Library/Calendars` (which is empty on modern macOS).

```
startWatchSidecar(onChange)  →  ensureBinary()  →  spawn(BINARY_PATH, [--watch])
                                  → stdout: CHANGED (1s Swift-side debounce)
                                  → debounce 2s → onChange()
                                  → on crash: exponential backoff restart (1s→16s, 5 retries)

stopWatchSidecar()  →  SIGTERM → 5s grace → SIGKILL
```

- **Notification**: `EKEventStoreChanged` on EKEventStore — fires for any calendar mutation (add, edit, delete)
- **Debounce**: 1s in Swift (coalesce rapid EKEventStore bursts), 2s in Node.js (coalesce CHANGED lines)
- **Exit**: stdin close (parent process death) → clean `exit(0)`
- **Restart**: exponential backoff 1s→2s→4s→8s→16s, capped at 30s, max 5 retries
- **Shutdown**: `stopped` flag suppresses restarts, SIGTERM → 5s grace → SIGKILL (timer unref'd)

## PARSING (event-parser.ts + event-field-parser.ts + event-validator.ts)

`parseEvents(raw: string): ParseResult`

Where `ParseResult = { events: MeetingEvent[]; diagnostics: ParseDiagnostic[] }`.

- `ParseDiagnostic` has `line`, `reason` (`malformed_field_count`, `invalid_iso`, etc.), `raw`
- **URL extraction**: Two regex patterns in Swift (`googlemeet-events.swift`) — Google Meet (`https://meet\\.google\\.com/...`) and Zoom (`https://(?:[a-zA-Z0-9-]+\\.)*zoom\\.us/...`). Zoom tried first, then Google Meet.
- Splits on newlines → tab-delimited fields (9 required, strict)
- Branded outputs: `EventId`, `MeetUrl`, `IsoUtc` via validators from `shared/brand.ts`
- Filters: valid dates, today+tomorrow only, deduplicates by UID, sorts by startDate ascending

`cleanDescription(notes: string): string`

- Strips HTML tags from CalDAV-synced event notes via `stripHtmlTags()`
- Strips Outlook/Exchange HTML-to-plaintext border artifacts
- Removes long separator lines (underscores, dashes, asterisks)

**Swift exit codes**: 0=success, 2=permission denied, 3=no calendars, 4=error. `classifySwiftError()` in `event-validator.ts` maps exit codes to typed `SwiftHelperError`.

**AppError mapping**: `SwiftHelperError.toAppError()` maps exit codes 2/3/4 to `AppError` discriminated union variants (`swift-permission-denied`, `swift-no-calendars`, `swift-runtime`). See `src/shared/errors.ts` for the full AppError taxonomy.

## TYPE GUARDS (guards.ts)

Runtime narrowing functions:

- `isObjectRecord(v)`: validates plain object
- `isExecErrorLike(v)`: validates exec error shape
- `getErrorStderr(v)`: safe stderr extraction
- `isStringTupleOfLength<N>(arr, n)`: recursive `BuildStringTuple` for `noUncheckedIndexedAccess`

Eliminates unsafe `as` casts from `event-parser.ts` and `calendar.ts`.

## ANTI-PATTERNS

- Never bundle Swift source inside ASAR — `swiftc` cannot read from ASAR archives (`asarUnpack` in electron-builder.yml)
- Never change `SWIFT_SRC_DEV` relative path without verifying bundled output resolution from `lib/main/index.cjs`
- Never silently suppress `.catch(() => {})` on binary operations, log or propagate errors
