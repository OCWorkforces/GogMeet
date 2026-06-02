# Swift Integration

Runtime compilation and parsing layer for the macOS EventKit helper. Source lives at `src/main/googlemeet-events.swift`; TypeScript in this directory finds, compiles, caches, executes, and validates its tab-delimited output.

## Files

| File | Role |
| --- | --- |
| `binary-manager.ts` | Locate Swift source, coordinate cache/compile, run helper. |
| `binary-cache.ts` | Hash Swift source and manage `/tmp/googlemeet/` binary/cache paths. |
| `binary-compiler.ts` | Compile Swift with arch-aware optimization flags and retry behavior. |
| `calendar-watch-sidecar.ts` | Sidecar process used by calendar change watching. |
| `event-parser.ts` | Parse 9-field Swift lines into `MeetingEvent[]` with branded fields. |
| `event-field-parser.ts` | Parse individual tab-delimited fields and optional values. |
| `event-validator.ts` | Validate Swift exit codes/output and map `SwiftHelperError` to `AppError`. |
| `guards.ts` | Swift helper type guards and validation helpers. |

## Binary cache

- Cache dir: `/tmp/googlemeet/` with mode `0o700`.
- Binary: `/tmp/googlemeet/googlemeet-events`.
- Hash sidecar: `/tmp/googlemeet/source.hash`.
- Recompile when source hash changes or binary is missing.
- Compile with arch-aware target and optimization flags (`-Osize`, `-whole-module-optimization`); optional strip after compile.
- Compile/run retries use exponential backoff, 5 attempts, up to 30s.

## Source paths

- Development/bundled main path: `SWIFT_SRC_DEV` resolves `../..` from `lib/main/index.cjs` back to project root, then `src/main/googlemeet-events.swift`.
- Packaged path: `process.resourcesPath/app.asar.unpacked/src/main/googlemeet-events.swift`.
- `electron-builder.yml` must keep Swift source in `asarUnpack`; `swiftc` cannot read from ASAR.

Do not change these paths without verifying both `bun run dev` and packaged `electron-builder --mac --dir` layout.

## Swift protocol

Output is one event per line, 9 tab-delimited fields:

```
uid\ttitle\tstartISO\tendISO\turl\tcalName\tallDay\temail\tnotes
```

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `2` | Calendar permission denied. |
| `3` | No calendars. |
| `4` | Runtime/helper error. |

## Parsing rules

- `uid` → `EventId` via `asEventId()`.
- `startISO` / `endISO` → `IsoUtc` via `asIsoUtc()`.
- `url` → `MeetUrl` via structural `asMeetUrl()` only; host allowlist is enforced later at egress.
- Empty optional fields become `undefined`; all-day field parses to boolean.
- Invalid lines are rejected through typed errors; do not silently drop malformed rows unless existing parser tests specify that behavior.
- `parseTimestampPair(startStr, endStr)` rejects `end < start` by returning `null`, so the row is treated as malformed and dropped rather than producing a `MeetingEvent` with a negative duration.

## Rules

- Do not import Electron/window/scheduler modules here; this is a leaf used by `domain/calendar.ts`.
- Keep Swift stdout/stderr and exit-code handling mapped into `CalendarResult` / `AppError` taxonomy.
- Do not suppress compile/run errors with empty catches.
- Tests must mock `node:child_process` with `promisify.custom` because production uses promisified `execFile`.
