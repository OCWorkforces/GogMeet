# Swift Integration

Runtime compilation and parsing layer for the **macOS EventKit** helper. Consumed only by `calendar/providers/darwin-eventkit.ts` (never by Windows Google path or `facades/calendar.ts`). Source: `src/main/googlemeet-events.swift`.

## Files

| File | Role |
| --- | --- |
| `binary-manager.ts` | Locate Swift source, coordinate cache/compile, run helper. Classifies exit 2/3/4 without recompile |
| `binary-cache.ts` | Hash Swift source and manage `{tmpdir}/googlemeet/` binary/cache paths |
| `binary-compiler.ts` | Compile Swift with arch-aware optimization flags and retry behavior |
| `calendar-watch-sidecar.ts` | Sidecar `--watch`; debounce CHANGED; backoff; **cooldown revive after MAX_RETRIES** |
| `event-parser.ts` | Parse 9-field Swift lines into `MeetingEvent[]` with branded fields |
| `event-field-parser.ts` | Parse individual JSON record fields (description cleaning → domain `clean-description`) |
| `event-validator.ts` | Validate Swift exit codes/output and map `SwiftHelperError` to `calendar-*` AppError kinds |
| `guards.ts` | Exec/tuple guards; imports `isObjectRecord` from `domain/entities/type-guards` |

## Binary cache

- Cache dir: `{os.tmpdir()}/googlemeet/` with mode `0o700` (not a hard-coded `/tmp` string).
- Binary: `…/googlemeet-events`.
- Hash sidecar: `…/source.hash`.
- Recompile when source hash changes or binary is missing.
- **Do not recompile** on semantic exits 2 (permission), 3 (no calendars), 4 (helper error) — throw `SwiftHelperError` so callers return structured `CalendarResult` codes.

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
- `reviveWatchSidecar()` / facade `reviveCalendarWatcher()` / `graph.watcher.revive()` on power resume.
- SIGTERM → SIGKILL after grace; stable runtime resets retry budget.

## Parsing rules

- `uid` → `EventId`; timestamps → `IsoUtc`.
- `url` → `MeetUrl` only if `validateMeetUrl` succeeds (HTTPS + host allowlist).
- Empty optionals → `undefined`; invalid lines → diagnostics / drop per parser tests.

## Rules

- Leaf package relative to calendar: no Electron/window/scheduler imports. Sole production importer is Darwin EventKit provider.
- Tests mock `node:child_process` with `promisify.custom`.
