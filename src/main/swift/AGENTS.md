# Swift Integration

Runtime compilation and parsing layer for the **macOS EventKit** helper. Consumed only by `calendar/providers/darwin-eventkit.ts` (never by Windows Google path or `facades/calendar.ts`). Source: `src/main/googlemeet-events.swift`.

## Files

| File | Role |
| --- | --- |
| `swift-helper-process.ts` | Bounded one-shot **spawn** runner: concurrent stdout/stderr drain, 8 MiB/256 KiB/15 s, AbortSignal, SIGTERM→5 s→SIGKILL |
| `binary-manager.ts` | Locate source, coordinate cache/compile, `runSwiftHelper(signal?)`. Integrity-only recompile |
| `binary-cache.ts` | Hash Swift source and manage `{tmpdir}/googlemeet/` binary/cache paths |
| `binary-compiler.ts` | Compile Swift with arch-aware optimization flags and retry behavior |
| `calendar-watch-sidecar.ts` | Sidecar `--watch`; debounce CHANGED; backoff; **cooldown revive after MAX_RETRIES** |
| `event-parser.ts` | Parse 9-field JSON Lines into `MeetingEvent[]` with branded fields + diagnostics |
| `event-field-parser.ts` | Parse individual JSON record fields (description cleaning → domain `clean-description`) |
| `event-validator.ts` | Validate Swift exit codes/output and map `SwiftHelperError` to `calendar-*` AppError kinds |
| `guards.ts` | Exec/tuple guards; imports `isObjectRecord` from `domain/entities/type-guards` |

## One-shot process runner

- Use `runSwiftHelperProcess` / `runSwiftHelper` — **not** unbounded `execFile` + `maxBuffer`.
- Safety ceilings: stdout **8 MiB**, stderr **256 KiB**, timeout **15 s** (engineering bounds, not optima).
- Settlement exactly once on child `close`.
- Abort/timeout/overflow: remove listeners → SIGTERM → grace (`SWIFT_HELPER_KILL_GRACE_MS` = 5 s) → SIGKILL.
- Prefer `.As<ChildProcessWithoutNullStreams>()` for stdio narrowing (`shared/utils/as.ts`).

## Binary cache + recompile taxonomy

- Cache dir: `{os.tmpdir()}/googlemeet/` with mode `0o700`.
- Binary: `…/googlemeet-events`. Hash sidecar: `…/source.hash`.
- `ensureBinary`: recompile when source hash changes or binary missing/not executable.
- **Runtime retry recompile (at most once)** only after independent integrity revalidation for:
  - verified hash mismatch, or
  - spawn `ENOENT` / `ENOEXEC`.
- **Never** recompile for: abort, timeout, stdout/stderr overflow, semantic exits 2/3/4, signal/unknown exit, malformed output, parser diagnostics.

## Source paths

- Dev/bundled: from `lib/main/index.cjs` → project `src/main/googlemeet-events.swift`.
- Packaged: `process.resourcesPath/app.asar.unpacked/src/main/googlemeet-events.swift`.
- `electron-builder.yml` must keep Swift source in `asarUnpack`.

## Swift protocol

JSON Lines: nine **JSON string** fields per line — `uid`, `title`, `startISO`, `endISO`, `url`, `calName`, `allDay`, `email`, `notes`.

| Exit | Meaning | Production mapping |
| --- | --- | --- |
| `0` | Success | parse events (diagnostics → live **partial**) |
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
- Empty optionals → `undefined`; invalid lines → diagnostics; duplicate uid recorded.
- Darwin provider: any diagnostic → `completeness: "partial"`.

## Rules

- Leaf package relative to calendar: no Electron/window/scheduler imports. Sole production importer is Darwin EventKit provider.
- Compile path may still use `execFile` for `swiftc`/`strip`; one-shot event dump uses spawn runner.
- Tests: `tests/main/swift/swift-helper-process.test.ts` (real Node fixture); binary-manager mocks process runner + compile.
