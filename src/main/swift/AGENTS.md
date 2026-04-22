# Swift — Binary Management & Event Parsing

Manages the Swift EventKit helper binary lifecycle and parses its output into typed data structures.

## FILES

| File                | Role                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `binary-manager.ts` | Compile, cache, and run the Swift helper with hash-based recompilation |
| `event-parser.ts`   | Parse 9-field tab-delimited Swift output into `MeetingEvent[]`         |

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

`parseEvents(raw: string): MeetingEvent[]`

- Splits on newlines → tab-delimited fields (9 required, strict, lines with fewer fields are rejected with warning log)
- Filters: valid dates, today+tomorrow only, deduplicates by UID
- Sorts by startDate ascending

`cleanDescription(notes: string): string`

- Strips Outlook/Exchange HTML-to-plaintext border artifacts (`-::~:~::~:...`)
- Removes long separator lines (underscores, dashes, asterisks)

**Swift exit codes**: 0=success, 2=permission denied, 3=no calendars, 4=error. `classifySwiftError()` maps exit codes to typed `SwiftHelperError`.

## ANTI-PATTERNS

- Never bundle Swift source inside ASAR — `swiftc` cannot read from ASAR archives (`asarUnpack` in electron-builder.yml)
- Never change `SWIFT_SRC_DEV` relative path without verifying bundled output resolution from `lib/main/index.cjs`
- Never silently suppress `.catch(() => {})` on binary operations, log or propagate errors
