# Swift Integration

Runtime compilation and parsing layer for the macOS EventKit helper. Source lives at `src/main/googlemeet-events.swift`; TypeScript in this directory finds, compiles, caches, executes, and validates its JSON Lines output.

## Files

| File | Role |
| --- | --- |
| `binary-manager.ts` | Locate Swift source, coordinate cache/compile, run helper. Classifies exit 2/3/4 without recompile. |
| `binary-cache.ts` | Hash Swift source and manage `/tmp/googlemeet/` binary/cache paths. |
| `binary-compiler.ts` | Compile Swift with arch-aware optimization flags and retry behavior. |
| `calendar-watch-sidecar.ts` | Sidecar `--watch`; debounce CHANGED; backoff; **cooldown revive after MAX_RETRIES**. |
| `event-parser.ts` | Parse 9-field Swift lines into `MeetingEvent[]` with branded fields. |
| `event-field-parser.ts` | Field parsers; **meet URL via `validateMeetUrl`** (allowlist at ingress). |
| `event-validator.ts` | `classifySwiftError`, `SwiftHelperError` → `AppError`. |
| `guards.ts` | Type guards and validation helpers. |

## Binary cache

- Cache dir: `/tmp/googlemeet/` with mode `0o700`.
- Binary: `/tmp/googlemeet/googlemeet-events`.
- Hash sidecar: `/tmp/googlemeet/source.hash`.
- Recompile when source hash changes or binary is missing.
- **Do not recompile** on semantic exits 2 (permission), 3 (no calendars), 4 (helper error) — throw `SwiftHelperError` so domain returns structured `CalendarResult` codes.

## Source paths

- Dev/bundled: from `lib/main/index.cjs` → project `src/main/googlemeet-events.swift`.
- Packaged: `process.resourcesPath/app.asar.unpacked/src/main/googlemeet-events.swift`.
- `electron-builder.yml` must keep Swift source in `asarUnpack`.

## Swift protocol

JSON Lines: nine strings per line — `uid`, `title`, `startISO`, `endISO`, `url`, `calName`, `allDay`, `email`, `notes`.

| Exit | Meaning | Production mapping |
| --- | --- | --- |
| `0` | Success | parse events |
| `2` | Permission denied | `CalendarResult` code `permission-denied` |
| `3` | No calendars | `no-calendars` |
| `4` | Runtime/helper error | `runtime` |

## Watch sidecar

- Debounce CHANGED ~2s; exponential restart backoff up to MAX_RETRIES (5).
- After give-up: **cooldown** then reset retries and spawn again.
- `reviveWatchSidecar()` / domain `reviveCalendarWatcher()` used on power resume.
- SIGTERM → SIGKILL after grace; stable runtime resets retry budget.

## Parsing rules

- `uid` → `EventId`; timestamps → `IsoUtc`.
- `url` → `MeetUrl` only if `validateMeetUrl` succeeds (HTTPS + host allowlist).
- Empty optionals → `undefined`; invalid lines → diagnostics / drop per parser tests.

## Rules

- Leaf package: no Electron/window/scheduler imports (domain is the consumer).
- Tests mock `node:child_process` with `promisify.custom`.
