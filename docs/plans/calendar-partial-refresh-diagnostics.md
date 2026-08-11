# calendar-partial-refresh-diagnostics - Work Plan

## TL;DR (For humans)

**What you'll get:** When the macOS EventKit helper returns a mix of valid and malformed records, GogMeet will keep the valid meetings, retain the existing generic limited warning, and show a small disabled EventKit diagnostic breakdown in the native tray menu. The breakdown contains only a total and fixed reason counts.

**Why this approach:** The current parser already knows why it skipped each record, but the Darwin provider only logs line-level diagnostics and the tray can only say that some calendars could not be refreshed. A fixed aggregate explains the partial result without exposing calendar content or changing the refresh contract.

**What it will NOT do:** It will not change the Swift protocol, retry or recompile the helper, alter Google partial results, cache diagnostics, add IPC or renderer behavior, or make partial data eligible for automation.

**Effort:** M

**Risk:** Medium. The change adds a cross-layer optional field, so stale state and the tray's signature skip must be handled explicitly. Privacy risk remains low only if the field stays a fixed numeric aggregate.

**Decisions already made:** Use a Darwin-named optional summary on live results, represent absent diagnostics as `null` in `CalendarUiState`, retain `CALENDAR_LIMITED_COPY`, display only nonzero reason rows in the native tray, and keep Google partials generic.

---

> TL;DR (machine): M/medium-risk plan for a fixed, redacted Darwin partial-refresh aggregate that preserves valid events and the partial automation gate, clears stale state, invalidates native tray signatures deterministically, and adds no renderer, IPC, Swift-protocol, cache, or Google behavior.

## Scope

### Must have

- Add a fixed typed `DarwinPartialRefreshDiagnostics` contract with `total` plus counts for `malformed_record`, `malformed_field_count`, `invalid_iso`, `invalid_id`, and `duplicate_uid`.
- Aggregate parser diagnostics after `parseEvents()` without retaining or forwarding individual diagnostics outside the parser and provider boundary. Emit exactly one safe aggregate `console.warn` for each Darwin partial refresh.
- Have the Darwin EventKit provider return valid events as a successful live `partial` result when `total > 0`, with the fixed summary attached. A clean parse remains live `complete` with no summary.
- Carry the optional Darwin summary through `CalendarResult` and into `CalendarUiState` only for a live partial result. Every other UI-state publication path must clear it.
- Keep the existing `CALENDAR_LIMITED_COPY` warning and render the detailed counts only as disabled rows in the native macOS tray menu.
- Include the fixed diagnostic values in `trayMenuSignature()` so a changed breakdown rebuilds the native menu even when events, phase, and generic warning are unchanged.
- Add TDD coverage at the parser, provider, application, scheduler, menu, tray signature, tray rebuild, domain, and renderer-regression seams named below.

### Must not have

- No product code or test changes in this planning task. This document is the only authorized change now.
- No Swift source or Swift JSON Lines protocol change. The helper still emits exactly nine string fields per record.
- No helper rerun, retry, fallback query, recompilation, timeout change, or binary-manager recovery policy change because records were skipped.
- No raw helper output, raw records, line contents, line numbers, event IDs, titles, calendar names, URLs, email addresses, notes, descriptions, or timestamps in logs, diagnostics, tray labels, IPC payload additions, caches, test snapshots, or error messages. The one permitted partial-refresh warning contains only the fixed numeric aggregate.
- No diagnostic cache data, offline-cache schema change, sync-token change, or persistence of the summary across application restarts.
- No change to Google provider output, Google partial copy, Google menu behavior, OAuth, polling, or cache behavior.
- No removal or replacement of the generic limited warning. No upgrade of any partial result to complete.
- No IPC channel, preload bridge, renderer production code, settings, alert, or popover product change.
- No change to the scheduler rule that only live complete data arms automatic browser opening, alerts, title updates, and countdown work.
- No commit, branch operation, push, or pull request unless separately authorized.

## Current evidence

- `bun run dev` built and launched Electron but produced neither Darwin diagnostic nor helper-error logs over more than three minutes, so the exact offending EventKit record was not reproduced.
- The mechanism is confirmed from the current source. `parseEvents()` can emit `malformed_record`, `malformed_field_count`, `invalid_iso`, `invalid_id`, and `duplicate_uid` diagnostics while retaining valid events.
- `createDarwinEventKitProvider().getEvents()` currently turns any parser diagnostic into a successful live partial result, then logs a per-diagnostic line and reason.
- `GetMeetings` maps every live partial result to `phase: "limited"` and `CALENDAR_LIMITED_COPY`, which is the tray's generic "Some calendars could not be refreshed" copy.
- `poll()` keeps successful partial events available for display and joining, then calls `suspendAutomation()` because `isCalendarAutomationEligible()` returns true only for a live complete result.
- `buildCalendarTrayMenuTemplate()` currently adds one disabled generic limited row. `trayMenuSignature()` currently includes phase and generic error text but not a diagnostic breakdown, so summary-only changes would otherwise be skipped.
- The popover renderer treats a partial `CalendarResult` as successful and renders retained events, or its existing no-events presentation when none are retained. It does not display `CALENDAR_LIMITED_COPY`, the tray warning, or EventKit diagnostic labels.

## Invariants

1. A parser diagnostic means the aggregate live result is `partial`, never `complete`. Valid records still produce valid `MeetingEvent` values and remain available for tray display and manual joining.
2. The only published diagnostic shape is a fixed numeric aggregate. Its five reason counts and `total` are finite nonnegative integers, and `total` equals the sum of the five counts.
3. The summary is present only on a Darwin EventKit live partial result. Google partials have no Darwin summary and keep the generic warning alone.
4. No value derived from a single EventKit record may leave `event-parser.ts` as a diagnostic payload or log value. That includes raw output, records, lines, IDs, titles, calendars, URLs, emails, notes, descriptions, and timestamps.
5. For each Darwin partial refresh, the provider calls `console.warn(summary)` exactly once, where `summary` is the fixed six-number aggregate and the only warning argument. A complete refresh produces no aggregate warning.
6. The Darwin provider makes one normal `runSwiftHelper(signal)` call per refresh. Parser diagnostics are not helper errors and never trigger retry, rerun, recompilation, or cache invalidation.
7. `isCalendarAutomationEligible()` remains unchanged. All partial results, including Darwin summaries, suspend automation while preserving display and manual join data.
8. A stale diagnostic summary must not survive a later complete live result, offline-cache result, failed result, disconnect/reset, or a Google partial result.
9. The native menu rebuild signature changes whenever any summary count changes. It must not contain record-derived strings.
10. The renderer remains unchanged. A successful partial result continues to render retained events or its existing no-events presentation, without `CALENDAR_LIMITED_COPY`, tray-warning text, EventKit detail labels, or parser reason tokens.

## Data contract

### Domain result contract

Define `DarwinPartialRefreshDiagnostics` in `src/domain/entities/calendar-result.ts` as a fixed readonly object:

| Field                 | Type     | Meaning                                                                     |
| --------------------- | -------- | --------------------------------------------------------------------------- |
| `total`               | `number` | Sum of all skipped malformed records. Must be a finite nonnegative integer. |
| `malformedRecord`     | `number` | Count for `malformed_record`.                                               |
| `malformedFieldCount` | `number` | Count for `malformed_field_count`.                                          |
| `invalidIso`          | `number` | Count for `invalid_iso`.                                                    |
| `invalidId`           | `number` | Count for `invalid_id`.                                                     |
| `duplicateUid`        | `number` | Count for `duplicate_uid`.                                                  |

Extend `CalendarResultOkLive` with this exact optional field:

```ts
readonly darwinPartialRefreshDiagnostics?: DarwinPartialRefreshDiagnostics;
```

`calendarLiveOk()` accepts the optional summary as a fourth parameter so provider tests can construct the canonical result. The helper must omit the property for complete results and for every non-Darwin provider result. Do not create a generic diagnostics union, free-form reason map, string bag, record array, or raw-data escape hatch.

### Parser boundary

Keep `ParseDiagnosticReason` as its current closed five-member union in `src/main/swift/event-validator.ts`. Add a parser-owned aggregation function in `src/main/swift/event-parser.ts` that accepts only `readonly ParseDiagnostic[]` and returns `DarwinPartialRefreshDiagnostics`. Initialize every count to zero, increment exactly one count for each closed reason, and derive `total` from the five counters. The function has no logging and does not include `ParseDiagnostic.line` in its output.

`parseEvents()` may retain its current internal `diagnostics` array for parser tests and immediate aggregation. The provider must discard that array after deriving the fixed summary. No other layer receives individual `ParseDiagnostic` values. The provider's only parser-diagnostic log is the one `console.warn(summary)` call defined by the invariant.

### UI-state contract

Add this required field to `CalendarUiState` in `src/domain/entities/calendar-ui-state.ts`:

```ts
readonly darwinPartialRefreshDiagnostics: DarwinPartialRefreshDiagnostics | null;
```

`defaultCalendarUiState()` sets it to `null`. `GetMeetings` sets it to the live result's summary only when the result is a live Darwin partial. It explicitly sets `null` for live complete, offline-cache, errors, and all partial results without a Darwin summary. Any direct UI-state publisher, including `reportCalendarPollError`, must also set it to `null` when it publishes an error. State replacement on disconnect or test reset inherits the `null` default.

### Native tray presentation contract

The existing disabled generic limited row remains first and unchanged:

```text
Some calendars could not be refreshed
```

Immediately after that row, only when `isDarwin()`, `ui.phase === "limited"`, and the UI-state summary is non-null, append disabled rows in this order:

1. `EventKit skipped N event record(s)` using the existing singular or plural convention selected by implementation.
2. `Malformed records: N` when `malformedRecord > 0`.
3. `Unexpected field count: N` when `malformedFieldCount > 0`.
4. `Invalid dates: N` when `invalidIso > 0`.
5. `Missing event IDs: N` when `invalidId > 0`.
6. `Duplicate event IDs: N` when `duplicateUid > 0`.

All rows have `enabled: false`. Do not show a row with a zero count. These labels describe categories only and never interpolate event data. Windows, Google, popover, Settings, alert, and renderer paths show no new detail rows.

### Tray signature contract

Add a fixed summary component to `trayMenuSignature()` after the generic `lastError` component. Encode `none` when the state field is `null`; otherwise encode `total`, `malformedRecord`, `malformedFieldCount`, `invalidIso`, `invalidId`, and `duplicateUid` in that exact order with a fixed separator. The component contains numbers only. A count change must produce a different signature, while equal values must produce the same signature.

## Execution strategy

### Dependency plan

| Todo                                                              | Depends on | Blocks           | Can run with |
| ----------------------------------------------------------------- | ---------- | ---------------- | ------------ |
| 1. Define aggregate and parser behavior                           | None       | 2, 3, 4          | None         |
| 2. Publish Darwin partial aggregate                               | 1          | 3                | None         |
| 3. Project and clear UI state while preserving scheduler behavior | 2          | 4, 5             | None         |
| 4. Render native tray details and invalidate its signature        | 3          | 5                | None         |
| 5. Run focused and repository validation                          | 4          | Final acceptance | None         |

The work is intentionally serialized. The typed summary controls every later layer, and a parallel implementation would create short-lived incompatible contracts. Each todo includes its own RED, GREEN, and cleanup work. Do not split implementation from its tests.

## Todos

### 1. Define and aggregate the fixed Darwin diagnostic summary

- Recommended executor category: `programming`.
- Files: `src/domain/entities/calendar-result.ts`, `src/main/swift/event-validator.ts`, `src/main/swift/event-parser.ts`, `src/domain/entities/calendar-ui-state.ts`, `tests/domain/calendar-result.test.ts`, `tests/main/swift/event-parser.test.ts`.
- What to do: Add the fixed domain interface and optional live-result field. Update `calendarLiveOk()` to support the optional aggregate without changing its existing complete and generic partial call sites. Add the parser aggregator described in the data contract. Add the required nullable UI-state field and default it to `null`.
- Must not do: Do not add a dynamic object keyed by arbitrary strings, carry `line`, or change the five parser reason codes. Do not alter the Swift helper protocol.
- TDD RED: Add parser cases that independently generate every reason, a mixed case containing all five, and a valid record beside malformed records. Assert exact fixed counts, `total`, and valid-event retention. Add domain cases that construct a partial live result with the optional summary, keep a complete result summary-free, and verify the default UI state has `null` diagnostics. Run:

```sh
bunx vitest run -c vitest.workspace.ts --project domain tests/domain/calendar-result.test.ts
bunx vitest run -c vitest.workspace.ts --project main tests/main/swift/event-parser.test.ts
```

- GREEN and acceptance: The five reasons map one-to-one into their fixed counters, `total` equals their sum, zero values are retained in the typed object, valid events remain in output, and no test fixture asserts or emits raw diagnostic lines outside the parser. The focused commands exit `0`.

### 2. Publish a Darwin live partial with one safe aggregate warning

- Recommended executor category: `programming`.
- Files: `src/main/calendar/providers/darwin-eventkit.ts`, `tests/main/calendar.test.ts`, with adjacent assertions in `tests/main/swift/event-parser.test.ts` if fixture setup needs a provider-shaped parse result.
- What to do: After `parseEvents()` returns, aggregate diagnostics. Return a normal live complete result when the aggregate total is zero. Return a normal live partial result with valid events and the typed summary when the total is positive. Replace the current per-diagnostic `console.warn` loop with exactly one `console.warn(summary)` call per partial refresh. Keep existing helper-error handling only for actual thrown helper failures.
- Must not do: Do not pass a prefix, message, reason string, raw line, record, or other value to the aggregate warning. Do not log individual diagnostics or any helper-derived record data. Do not call `runSwiftHelper` a second time, modify `ensureBinary`, add retries, or treat parser diagnostics as `SwiftHelperError` values.
- TDD RED: Mock a helper response containing one valid record and malformed records for several reasons, including a sentinel raw-content string in a skipped record. Assert that the provider returns `kind: "ok"`, `source: "live"`, `completeness: "partial"`, the valid event, and only the typed counts. Spy on `console.warn` and assert exactly one call with the expected six-count object as its only argument, with no sentinel content in the captured call. Assert one helper call and zero retry or binary/recovery calls. Add a clean response case that remains complete, omits the summary, and emits no aggregate warning. Run:

```sh
bunx vitest run -c vitest.workspace.ts --project main tests/main/calendar.test.ts tests/main/swift/event-parser.test.ts
```

- GREEN and acceptance: Parser diagnostics affect completeness, the typed aggregate, and exactly one count-only aggregate warning. A helper that succeeds is never rerun, retried, or recompiled. Existing permission, no-calendar, runtime, and unknown helper-error mappings remain green.

### 3. Project diagnostics into UI state, clear stale values, and preserve partial scheduling semantics

- Recommended executor category: `programming`.
- Files: `src/main/application/use-cases/get-meetings.ts`, `src/main/facades/calendar.ts`, `src/main/scheduler/poll.ts`, `tests/application/get-meetings.test.ts`, `tests/main/scheduler-poll.test.ts`, `tests/main/calendar.test.ts`.
- What to do: In the live partial branch, copy the optional Darwin summary to `CalendarUiState` and retain `CALENDAR_LIMITED_COPY`. In each live complete, offline-cache, and error branch, explicitly write `darwinPartialRefreshDiagnostics: null`. Update `reportCalendarPollError` to clear it as well. Audit each `CalendarUiState` constructor or full reset to ensure it supplies the new required field through the default state or an explicit `null`.
- Must not do: Do not derive a summary for Google partial results. Do not add a renderer field, change `lastError`, change offline semantics, or change `isCalendarAutomationEligible()`.
- TDD RED: Add transition tests for Darwin partial to live complete, Darwin partial to offline-cache, Darwin partial to error, and Darwin partial to Google partial. Assert the first state contains counts and each later state contains `null`. Add a Google partial test that keeps `phase: "limited"` and generic copy but has no detail summary. In scheduler tests, assert a Darwin partial still preserves events for publication and calls `suspendAutomation()` rather than scheduling automation. Run:

```sh
bunx vitest run -c vitest.workspace.ts --project application tests/application/get-meetings.test.ts
bunx vitest run -c vitest.workspace.ts --project main tests/main/calendar.test.ts tests/main/scheduler-poll.test.ts
```

- GREEN and acceptance: The state never retains counts after a non-Darwin-partial publication, generic partial behavior stays unchanged, and partial automation remains suspended while manual joining and display data remain available.

### 4. Show redacted details in the native tray and make signature invalidation deterministic

- Recommended executor category: `programming`.
- Files: `src/main/menu/meeting-menu.ts`, `src/main/tray.ts`, `tests/main/meeting-menu.test.ts`, `tests/main/tray-rebuild-coalesce.test.ts`, `tests/main/tray.test.ts`, `tests/renderer/main-ui.test.ts`.
- What to do: Add the disabled native-only rows exactly as defined in the tray presentation contract. Keep the generic limited row. Add the fixed numeric summary component to `trayMenuSignature()`, and update all fallback `CalendarUiState` literals in `tray.ts` to provide `null` diagnostics. Do not alter renderer production code.
- Must not do: Do not add the detailed rows on Windows, in Google partials, popover, Settings, alert, or renderer code. Do not put summary detail in the generic warning or use a raw reason string as a label.
- TDD RED: Add menu tests for a Darwin limited state with a mixed summary, a single-reason summary, zero-count suppression, and the unchanged generic limited row. Add Windows and Google partial cases that show no EventKit details. Add signature tests that change one counter at a time and assert a signature difference, then assert identical values keep the signature stable. Add a coalesced rebuild case proving a summary-only change reaches one native `setContextMenu` install rather than being signature-skipped. Add a negative renderer regression that a successful partial with valid retained events renders those events while `CALENDAR_LIMITED_COPY`, the tray-warning text, EventKit detail labels, and all parser reason tokens are absent. No renderer production code is needed. Run:

```sh
bunx vitest run -c vitest.workspace.ts --project main tests/main/meeting-menu.test.ts tests/main/tray-rebuild-coalesce.test.ts tests/main/tray.test.ts
bunx vitest run -c vitest.workspace.ts --project renderer tests/renderer/main-ui.test.ts
```

- GREEN and acceptance: macOS presents the generic warning plus the fixed disabled details. Windows and Google remain generic. A count-only change rebuilds the native menu, identical state does not rebuild, and the unchanged renderer displays valid partial events without tray-only warnings or diagnostic labels.

### 5. Run privacy, focused regression, and repository gates

- Recommended executor category: `programming`.
- Files: no new product files. Inspect the final diff and every changed test fixture.
- What to do: Review the final typed contract, menu labels, `console.warn` calls, assertions, fixtures, and signature encoding against the no-sensitive-data contract. Confirm that each Darwin partial refresh makes exactly one `console.warn(summary)` call with only the six numeric fields, while complete refreshes make none. Confirm no cache or offline schema files, Google files, Swift protocol source, preload files, IPC maps, or renderer production files changed. Confirm no test calls represent a second helper execution or recovery path.
- Must not do: Do not weaken, skip, or delete pre-existing tests. Do not accept fixture data as a reason to leak raw record fields in snapshots, console output, or labels.
- Focused regression commands:

```sh
bunx vitest run -c vitest.workspace.ts --project domain tests/domain/calendar-result.test.ts
bunx vitest run -c vitest.workspace.ts --project main tests/main/swift/event-parser.test.ts tests/main/calendar.test.ts tests/main/scheduler-poll.test.ts tests/main/meeting-menu.test.ts tests/main/tray-rebuild-coalesce.test.ts tests/main/tray.test.ts
bunx vitest run -c vitest.workspace.ts --project application tests/application/get-meetings.test.ts
bunx vitest run -c vitest.workspace.ts --project renderer tests/renderer/main-ui.test.ts
```

- Full validation commands:

```sh
bun run typecheck
bun run lint
bun run format:check
bun run guardrails
bun run guardrails:tests
bun run test
bun run build
```

- Manual QA: On macOS, use a controlled mocked EventKit provider seam in the existing Electron main test harness to trigger a Darwin partial with counts. Assert the one `console.warn` argument is the fixed aggregate and contains no synthetic sentinel content. Open the actual native tray menu and observe the disabled generic row and only the expected disabled count rows. Then publish a complete result and observe that every EventKit detail row disappears. Repeat with a Google partial and observe the generic warning without EventKit rows. Do not use a real calendar event or log raw helper output.
- GREEN and acceptance: All focused and full commands exit `0`, except an isolated documented pre-existing failure established before implementation. Manual QA shows the native transition and stale-state clearing with synthetic data only.

## Validation checklist

- [ ] `DarwinPartialRefreshDiagnostics` has exactly six numeric fields and no optional free-form metadata.
- [ ] Parser tests cover all five reasons, mixed input, clean input, and valid-event retention.
- [ ] Darwin provider tests prove one helper execution, exactly one six-count aggregate warning without sentinel content, no retry, and no recompile.
- [ ] Application tests prove stale diagnostics clear for complete, offline, error, disconnect/reset, and Google partial paths.
- [ ] Scheduler tests prove Darwin partial data remains display and join capable while automation is suspended.
- [ ] Native menu tests prove disabled generic and detailed rows, stable order, zero suppression, and no Windows or Google details.
- [ ] Tray tests prove summary changes invalidate the signature and produce a menu install.
- [ ] Renderer tests prove valid partial events render while `CALENDAR_LIMITED_COPY`, the tray warning, EventKit detail labels, and parser reason tokens remain absent, with no production renderer change.
- [ ] The final diff excludes Swift protocol, cache schema, Google provider, IPC, preload, renderer production, and commit metadata changes.

## Risks and mitigations

| Risk                                                           | Mitigation                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The original malformed EventKit record was not reproduced.     | Limit the work to already-confirmed parser outcomes and use synthetic JSON Lines fixtures for every reason. Do not claim a root cause for a particular user event. |
| A previous Darwin summary stays visible after a later refresh. | Make the UI field required and nullable, assign `null` in every non-Darwin-partial publication, and test each transition.                                          |
| A count-only update is skipped by tray signature caching.      | Include the fixed six-number component in the signature and test one-counter changes.                                                                              |
| Calendar content leaks through diagnostics.                    | Use only `console.warn(summary)` with the closed six-number aggregate; inspect logs, labels, fixtures, and snapshots before acceptance.                            |
| Google behavior changes by sharing the live partial union.     | Keep the field optional on the result, write `null` unless the Darwin provider populated it, and add a Google partial regression test.                             |
| Partial data accidentally starts automation.                   | Leave `isCalendarAutomationEligible()` untouched and assert `suspendAutomation()` for the Darwin partial path.                                                     |

## Acceptance criteria

1. The only new diagnostic data is a typed aggregate of total plus the five named reason counts. It contains no record-derived strings or identifiers.
2. A Darwin helper response containing both valid and malformed records returns a live partial result with valid events and exact counts. It makes exactly one `console.warn(summary)` call containing only those six counts and no sentinel content. It is not treated as a helper error and causes no rerun, retry, or recompile.
3. The existing generic limited warning remains visible for every partial result. Only the macOS native tray appends the fixed disabled EventKit detail rows for a Darwin partial summary.
4. Google partial results remain generic and never display EventKit details.
5. Automation remains suspended for Darwin partial results. Valid events remain available for display and manual joining.
6. A complete, offline, error, disconnect/reset, or Google partial state clears a previous Darwin summary. A summary-count change alone invalidates the tray signature and refreshes the native menu.
7. No raw helper output, record, line, event ID, title, calendar name, URL, email, note, description, or timestamp is logged, displayed, stored, cached, or placed in a diagnostic contract. The sole permitted diagnostic log is the one count-only aggregate `console.warn(summary)` call for a Darwin partial refresh.
8. All focused tests, the full validation commands, and synthetic-data native tray QA pass. The final diff contains no unauthorized Swift protocol, cache, Google, IPC, preload, renderer production, or commit changes.
