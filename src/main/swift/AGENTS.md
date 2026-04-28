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

## PARSING (event-parser.ts + event-field-parser.ts + event-validator.ts)

`parseEvents(raw: string): ParseResult`

Where `ParseResult = { events: MeetingEvent[]; diagnostics: ParseDiagnostic[] }`.

- `ParseDiagnostic` has `line`, `reason` (`malformed_field_count`, `invalid_iso`, etc.), `raw`
- Diagnostics logged via `console.warn` by `calendar.ts` consumer
- Splits on newlines → tab-delimited fields (9 required, strict)
- Branded outputs: `EventId`, `MeetUrl`, `IsoUtc` via validators from `shared/brand.ts`
- Filters: valid dates, today+tomorrow only, deduplicates by UID, sorts by startDate ascending

`cleanDescription(notes: string): string`

- Strips HTML tags from CalDAV-synced event notes via `stripHtmlTags()`
- Strips Outlook/Exchange HTML-to-plaintext border artifacts
- Removes long separator lines (underscores, dashes, asterisks)

**Swift exit codes**: 0=success, 2=permission denied, 3=no calendars, 4=error. `classifySwiftError()` in `event-validator.ts` maps exit codes to typed `SwiftHelperError`.

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
