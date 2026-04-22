# Swift — Binary Management & Event Parsing

Manages the Swift EventKit helper binary lifecycle and parses its output into typed data structures.

## FILES

| File                | Role                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `binary-manager.ts` | Compile, cache, and run the Swift helper with hash-based recompilation |
| `event-parser.ts`   | Parse 9-field tab-delimited Swift output into `MeetingEvent[]`         |
| `guards.ts`         | Runtime type guards for Swift output fields, eliminates unsafe `as` casts |

## BINARY LIFECYCLE (binary-manager.ts)

1. `runSwiftHelper()` → `ensureBinary()` → check hash → compile if needed → execute
2. On failure: delete binary + hash → recompile → retry up to 5 times with exponential backoff (1s→30s)
3. Binary cached in OS temp dir (`$TMPDIR/googlemeet/googlemeet-events`)
4. Hash stored alongside binary (`source.hash`) — only recompiles when Swift source changes
5. Cache directory created with mode `0o700` (owner-only access)
6. Binary hash verified before execution; recompiled on mismatch
7. On compile timeout: SIGTERM → 5s grace → SIGKILL

### Path Resolution

```
Dev:     lib/main/index.cjs → __dirname → ../../src/main/googlemeet-events.swift
Prod:    process.resourcesPath/app.asar.unpacked/src/main/googlemeet-events.swift
```

**CRITICAL**: `SWIFT_SRC_DEV` uses `../..` (2 levels up from `lib/main/`), NOT `../../..`. The rslib bundler flattens `src/main/swift/` into `lib/main/index.cjs`, reducing directory depth by 1 level.

### Compilation

- Architecture-aware target: `arm64-apple-macosx11.0` or `x86_64-apple-macosx11.0`
- Flags: `-Osize -whole-module-optimization`
- Fallback with explicit SDK path for CI environments
- `strip -x -S` removes debug symbols (optional)

## PARSING (event-parser.ts)

`parseEvents(raw: string): ParseResult`

Where `ParseResult = { events: MeetingEvent[]; diagnostics: ParseDiagnostic[] }`.

- `ParseDiagnostic` has `line`, `reason` (`malformed_field_count`, `invalid_iso`, `unknown_calendar`, etc.), `raw`
- Diagnostics logged via `console.warn` by `calendar.ts` consumer
- Splits on newlines → tab-delimited fields (9 required, strict, lines with fewer fields rejected with diagnostic)
- Branded outputs: `parseEvents` produces branded `EventId`, `MeetUrl`, `IsoUtc` fields via validators from `shared/brand.ts`
- Filters: valid dates, today+tomorrow only, deduplicates by UID
- Sorts by startDate ascending

`cleanDescription(notes: string): string`

- Strips Outlook/Exchange HTML-to-plaintext border artifacts (`-::~:~::~:...`)
- Removes long separator lines (underscores, dashes, asterisks)

**Swift exit codes**: 0=success, 2=permission denied, 3=no calendars, 4=error. `classifySwiftError()` maps exit codes to typed `SwiftHelperError`.

## TYPE GUARDS (guards.ts)

Runtime narrowing functions:

- `isObjectRecord(v)`: validates plain object
- `isExecErrorLike(v)`: validates exec error shape
- `getErrorStderr(v)`: safe stderr extraction
- `isStringTupleOfLength<N>(arr, n)`: recursive `BuildStringTuple` for `noUncheckedIndexedAccess`

Eliminates 3 unsafe `as` casts from `event-parser.ts` and `calendar.ts`.

## ANTI-PATTERNS

- Never bundle Swift source inside ASAR — `swiftc` cannot read from ASAR archives (`asarUnpack` in electron-builder.yml)
- Never change `SWIFT_SRC_DEV` relative path without verifying bundled output resolution from `lib/main/index.cjs`
- Never silently suppress `.catch(() => {})` on binary operations, log or propagate errors
