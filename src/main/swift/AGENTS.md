# Swift Integration

Runtime compilation and parsing layer for the **macOS EventKit** helper. Consumed only by `calendar/providers/darwin-eventkit.ts` (never by Windows Google path or `facades/calendar.ts`).

**Sources (both required):**

- `src/main/googlemeet-events.swift` — EventKit one-shot + `--watch` helper
- `src/main/swift/event-occurrence-identity.swift` — pure `eventRecordIdentifier` for occurrence-aware UIDs

## Files

| File                               | Role                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `event-occurrence-identity.swift`  | `eventRecordIdentifier(calendarItemIdentifier:occurrenceDate:startDate:)` → stable per-occurrence uid                                  |
| `../googlemeet-events.swift`       | EventKit helper (path stable at `src/main/`); emits 9-field JSON Lines; uses `eventRecordIdentifier` for the `uid` field               |
| `swift-helper-process.ts`          | Bounded one-shot **spawn** runner: concurrent stdout/stderr drain, 8 MiB/256 KiB/15 s, AbortSignal, SIGTERM→5 s→SIGKILL                |
| `binary-manager.ts`                | Locate sources, coordinate cache/compile, `runSwiftHelper(signal?)`. Integrity-only recompile                                          |
| `binary-cache.ts`                  | Dual-source read/hash (`readSwiftSource`), path resolution, `{tmpdir}/googlemeet/` binary/cache paths                                  |
| `binary-compiler.ts`               | Compile Swift with arch-aware optimization flags and retry behavior                                                                    |
| `calendar-watch-sidecar.ts`        | Sidecar `--watch`; debounce CHANGED; backoff; **cooldown revive after MAX_RETRIES**; **stdout 8 MiB / stderr 256 KiB** stream ceilings |
| `event-parser.ts`                  | Parse 9-field JSON Lines into `MeetingEvent[]` with branded fields plus internal diagnostics and a safe count aggregate                |
| `event-field-parser.ts`            | Parse individual JSON record fields (description cleaning → domain `clean-description`)                                                |
| `event-validator.ts`               | Validate Swift exit codes/output and map `SwiftHelperError` to `calendar-*` AppError kinds                                             |
| `guards.ts`                        | Exec/tuple guards; imports `isObjectRecord` from `domain/entities/type-guards`                                                         |

## One-shot process runner

- Use `runSwiftHelperProcess` / `runSwiftHelper` — **not** unbounded `execFile` + `maxBuffer`.
- Safety ceilings: stdout **8 MiB**, stderr **256 KiB**, timeout **15 s** (engineering bounds, not optima).
- Settlement exactly once on child `close`.
- Abort/timeout/overflow: remove listeners → SIGTERM → grace (`SWIFT_HELPER_KILL_GRACE_MS` = 5 s) → SIGKILL.
- Prefer free-function `As<ChildProcessWithoutNullStreams>(spawn(...))` for stdio narrowing (`shared/utils/as.ts`). Do **not** use method-form `.As()` here — production main bundles can tree-shake the prototype install.

## Binary cache + recompile taxonomy

- Cache dir: `{os.tmpdir()}/googlemeet/` with mode `0o700`.
- Binary: `…/googlemeet-events`. Hash sidecar: `…/source.hash`.
- Generated compile unit: `COMPILED_SWIFT_SOURCE_PATH` (`…/googlemeet-events.swift` under the cache dir) — single-file `swiftc` input (top-level statements require single-file mode; multi-file `swiftc` fails for this script shape).
- `readSwiftSource` returns **identity + `"\n"` + events**. `getSourceHash` / `verifyBinaryHash` / release smoke all digest that buffer.
- `ensureBinary`: recompile when dual-source hash changes or binary missing/not executable; mtime memoization keys **both** source paths.
- **Runtime retry recompile (at most once)** only after independent integrity revalidation for:
  - verified hash mismatch, or
  - spawn `ENOENT` / `ENOEXEC`.
- **Never** recompile for: abort, timeout, stdout/stderr overflow, semantic exits 2/3/4, signal/unknown exit, malformed output, parser diagnostics.

## Source paths

- Dev/bundled: from `lib/main/index.cjs` → project `src/main/googlemeet-events.swift` and `src/main/swift/event-occurrence-identity.swift`.
- Packaged: both under `process.resourcesPath/app.asar.unpacked/…` (same relative paths).
- Integrity hash (`source.hash`) digests **identity + `"\n"` + events** (same contract as `scripts/macos-release-verifier-native.mjs`).
- `electron-builder.yml` must keep **both** Swift sources in `files` and `asarUnpack`.

## Occurrence-aware UID

- Recurring EventKit instances share `calendarItemIdentifier`; without occurrence stamping they collapse to one id and break scheduling/join.
- `eventRecordIdentifier` formats `"\(calendarItemIdentifier):\(timestampBitPattern)"` using `occurrenceDate ?? startDate` (Double `timeIntervalSince1970.bitPattern`).
- Parser brands the full string as `EventId`; no separate split of the suffix is required.

## Swift protocol

Each helper output line is a JSON array of exactly nine strings, in this order: `uid`, `title`, `startISO`, `endISO`, `url`, `calName`, `allDay`, `email`, `notes`.

| Exit | Meaning              | Production mapping                            |
| ---- | -------------------- | --------------------------------------------- |
| `0`  | Success              | parse events (diagnostics → live **partial**) |
| `2`  | Permission denied    | `CalendarResult` code `permission-denied`     |
| `3`  | No calendars         | `no-calendars`                                |
| `4`  | Runtime/helper error | `runtime`                                     |

## Watch sidecar

- Helper (`--watch`) debounces EK change notifications **1000 ms** before printing `CHANGED`.
- Node sidecar debounces CHANGED ~**2000 ms**; exponential restart backoff up to MAX_RETRIES (5).
- After give-up: **cooldown** `GIVE_UP_COOLDOWN_MS` = **5 minutes**, then reset retries and spawn again.
- `reviveWatchSidecar()` / facade `reviveCalendarWatcher()` / `graph.watcher.revive()` on power resume.
- SIGTERM → SIGKILL after grace; stable runtime resets retry budget.
- Stream ceilings (exported; byte-identical to one-shot helper): `WATCH_SIDECAR_STDOUT_LIMIT_BYTES` = **8 MiB**, `WATCH_SIDECAR_STDERR_LIMIT_BYTES` = **256 KiB**. Per-child counters reset on spawn/stop.
- **Stdout overflow:** stop retaining, one redacted overflow diagnostic, SIGTERM + 5 s SIGKILL escalation; recovery uses the normal exit/restart budget — **never** recompile-on-overflow.
- **Stderr ceiling:** log only through the cap, one suppression notice, discard later stderr **without** restarting the child.
- **Restart budget:** at most one `scheduleRestart` per child lifetime (`error` and `exit` both fire on many spawn failures — do not double-count `MAX_RETRIES`).

## Parsing rules

- `uid` → `EventId`; timestamps → `IsoUtc`.
- `url` → `MeetUrl` only if `validateMeetUrl` succeeds (HTTPS + host allowlist).
- Empty optionals → `undefined`; invalid lines → diagnostics; duplicate uid recorded.
- Darwin provider: any diagnostic → `completeness: "partial"`.
- Closed diagnostic reasons are `malformed_record`, `malformed_field_count`, `invalid_iso`, `invalid_id`, and `duplicate_uid`. Per-line diagnostics, including line numbers, stay inside the parser.
- `aggregateParseDiagnostics` emits only `total` plus one count for each closed reason. The Darwin provider calls it once, retains valid events in a live partial result, and writes one `console.warn(summary)`. It never exposes raw records or retries/recompiles because of parser diagnostics.

## Rules

- Leaf package relative to calendar: no Electron/window/scheduler imports. Sole production importer is Darwin EventKit provider.
- Compile path may still use `execFile` for `swiftc`/`strip`; one-shot event dump uses spawn runner.
- Facades must not import this package.
- Tests:
  - `tests/main/swift/swift-helper-process.test.ts` (real Node fixture)
  - `tests/main/swift/event-parser.test.ts`
  - `tests/main/swift/event-occurrence-identity.test.ts` (darwin-only real `swiftc` of the identity source)
  - `tests/main/swift-binary-manager.test.ts` (distinct identity/events fixtures; order-sensitive dual-source hash)
  - `tests/main/swift-guards.test.ts`
  - `tests/main/calendar-watch-sidecar.test.ts` (mocked exec/spawn as appropriate)
