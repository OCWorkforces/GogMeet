# fix-tray-refresh-reschedule — Work Plan

## TL;DR (For humans)

**What you'll get:** Tray **Refresh** (and other intentional user refreshes) always re-fetch the calendar immediately, then rebuild the menu from the new data so a rescheduled meeting (e.g. 9AM → 6PM) shows the new time when you open the tray again.

**Why this approach:** Background polling and Calendar “CHANGED” storms still need a short coalesce window so we do not thrash EventKit. Only **user** refresh must bypass that window and wait for a real fetch + menu rebuild.

**What it will NOT do:** It will not change poll intervals, automation eligibility, offline cache rules, or claim multi-source EventKit parity. Optional EventKit freshness hardening is a follow-up if dogfood still shows Calendar.app ahead of EventKit.

**Effort:** Medium  
**Risk:** Medium — scheduler force-poll is shared by tray, watch, power resume, and tests; reason-tagged bypass must not reintroduce thrash.  
**Decisions to sanity-check:** User refresh bypasses the 10s coalesce; automatic/watch paths keep coalesce; Refresh awaits completion then force-rebuilds the tray menu.

Your next move: implement Wave 1 (user force-poll + tray wiring + tests + AGENTS refresh), dogfood on macOS, then only if needed Wave 2 (EventKit freshness + AGENTS refresh).

---

> TL;DR (machine): Medium effort, medium risk; user-intent forcePoll bypasses 10s coalesce and awaits tray rebuild; keep coalesce for watch/auto; optional EventKit freshness follow-up; refresh related AGENTS.md after every wave.

## Problem statement

### Reported situation

1. Create a macOS Calendar event at 9AM (with a Meet/Zoom/Calendly link so it appears in GogMeet).
2. Reschedule the event to 6PM in Calendar.app.
3. Left-click the tray icon (opens the native tray menu on macOS) and choose **Refresh**.
4. Re-open the menu — **times still reflect the pre-reschedule snapshot** (or the meeting disappears if “now” is past the old end).

### Verdict

| Finding | Status |
| --- | --- |
| Signature / coordinator “forever stale” | **Not supported** — `eventListSignature` includes `startDate`/`endDate`; coordinator follows latest chain completion |
| Tray Refresh fails to always re-fetch | **Confirmed product defect** |
| Darwin menu shows cache until async poll finishes | **Confirmed UX gap** |
| Wall-clock upcoming filter amplifies stale data | **Confirmed semantics** (not a wrong inequality) |
| EventKit lag vs Calendar.app UI | **Possible external** — only after user refresh reliably re-fetches |

### Root cause (primary)

```text
Left-click tray (Darwin)
  → void forcePoll()          // often within 10s of last poll → DEFER or SKIP
  → native menu opens from last setContextMenu (stale times)

User clicks Refresh
  → void forcePoll()          // same 10s coalesce; may only schedule deferred poll
  → returns null fire-and-forget; menu already closed
  → no await, no force tray rebuild

Re-open menu before deferred poll / Swift finishes
  → still last template / lastKnownEvents
```

**Code owners:**

| Area | Path |
| --- | --- |
| 10s coalesce | `src/main/scheduler/facade.ts` (`FORCE_POLL_COALESCE_MS = 10_000`) |
| Refresh wiring | `src/main/tray.ts` `onForcePoll` → `void forcePoll()` |
| Menu item | `src/main/menu/meeting-menu.ts` footer **Refresh** |
| Fetch + publish | `src/main/scheduler/poll.ts` → `refreshCalendarPublication` → Darwin Swift helper |
| Upcoming filter | `src/domain/services/meeting-time.ts` (`end > now`) |

Secondary: on the coalesce path, if `inFlightPoll !== null`, the caller joins the in-flight promise **without** setting `queuedPollRequested`, so a Refresh during a mid-flight poll may not request a follow-up fetch after that batch.

### Why time-of-day changes the symptom

| When you test | Stale 9AM–9:30 snapshot looks like |
| --- | --- |
| Before old end | Still listed at **9:00** |
| After old end | Dropped from upcoming (or **Ended** if completed-history is on) — “never moved to 6PM” |
| After successful live fetch with 6PM | Label shows **6:00 PM** (signature includes start/end) |

### Out of scope for this plan

- Changing 2min/4min background poll cadence.
- Showing the popover BrowserWindow as primary UI (still tray-first on macOS).
- Google offline-cache / Windows OAuth changes (unless share the same `forcePoll` API).
- Claiming EventKit multi-account parity.

---

## Scope

### Must have

1. **User-intent refresh path** that always runs a coordinated poll **immediately** (bypass `FORCE_POLL_COALESCE_MS`), while automatic paths (periodic poll arm, watch CHANGED, left-click thrash protection as decided below) keep coalesce.
2. Tray **Refresh** (and Retry / Connect-granted refresh if they share the same UX expectation) **await** that path, then **force-rebuild** the tray menu from the new publication / `cachedMeetings`.
3. Coalesce + in-flight: user refresh (and preferably any forcePoll while in-flight) must still **queue one follow-up** via the existing guarded poll / coordinator, not join a mid-flight batch without a post-batch fetch when the user asked for fresh data.
4. Tests proving: after a completed poll, user Refresh invokes `refreshCalendarPublication` immediately; mock provider returning same id with new startDate rebuilds menu labels; auto/watch path still coalesces.
5. **After each wave**, refresh the **related** `AGENTS.md` files so agent maps match that wave’s shipped behavior (not a single end-of-plan docs dump).

### Must NOT have

- Do not remove coalesce entirely for watch/wake storms (thrash risk).
- Do not reintroduce `SCHEDULER_FORCE_POLL` IPC or renderer force-poll channels (guardrail G6).
- Do not import `swift/*` from facades/tray.
- Do not clear Google tokens or change automation eligibility rules.
- Do not raise Swift buffers or unbounded `execFile` maxBuffer.

### Nice-to-have (Wave 2 — only if dogfood fails after Wave 1)

- Swift: `refreshSourcesIfNecessary()` before `events(matching:)` and/or one retry when CHANGED-driven fetch signature equals previous snapshot within a short window.
- Optional short “Refreshing…” disabled tray row (harder with static Electron menus; prefer post-await rebuild).

---

## Proposed API shape

```typescript
// scheduler/facade.ts (illustrative)
export type ForcePollReason = "user" | "auto" | "watch" | "power";

export async function forcePoll(
  options?: { reason?: ForcePollReason },
): Promise<CalendarPublication | null>;

// Coalesce only when reason is not "user" (default "auto" for backward-compat).
// reason: "user" → skip FORCE_POLL_COALESCE_MS gate; still use runGuardedPoll + coordinator.
```

Call sites:

| Caller | Reason |
| --- | --- |
| Tray Refresh / Retry | `"user"` |
| Tray left-click | Prefer `"user"` **or** keep `"auto"` if product wants click to stay soft; **Refresh must be `"user"`** |
| Calendar watch CHANGED | `"watch"` (coalesce) |
| Power resume / scheduler restart path | `"power"` / existing restart (coalesce or restart as today) |
| Connect granted → forcePoll | `"user"` |

Tray:

```typescript
onForcePoll: () => {
  void graph.scheduler.forcePoll({ reason: "user" }).then(() => {
    requestTrayRebuild(mainWindow, { force: true });
  });
},
```

If `AppGraph.scheduler.forcePoll` currently has no options, extend the graph surface the same way (narrow port may stay `Promise<void>` without options if only graph/tray need reason — prefer graph + facade; keep `SchedulerPort.forcePoll()` for use cases that only need “kick” semantics).

---

## Verification strategy

- Test decision: tests-after with Vitest `main` project + fake timers.
- Evidence: command output under normal local runs; optional manual macOS dogfood checklist in this doc.
- No live EventKit required for Wave 1 unit tests (mock `refreshCalendarPublication` / provider).

### Manual dogfood (macOS)

1. Wait >10s after idle so last poll is old.
2. Create Meet-linked event at a near-future morning time; confirm tray shows it.
3. Move event to evening (e.g. 6PM) in Calendar.app.
4. Immediately open tray → **Refresh** → re-open menu.
5. **Expect (after fix):** new time within one Swift round-trip (~seconds), not after 10s coalesce.
6. Repeat with “now” before and after the original end time.
7. If still stale after Wave 1 with logs showing a new `publicationGeneration` and old `startDate` from Swift stdout, escalate to Wave 2 EventKit freshness.

---

## Execution strategy

### Parallel execution waves

- **Wave 1:** Todos 1–3 (API + tray + tests), then **Todo 4** (Wave 1 AGENTS.md refresh). Dogfood on macOS before considering Wave 2.
- **Wave 2 (optional):** Todo 5 only if dogfood still fails with proven live fetch of old EventKit rows, then **Todo 6** (Wave 2 AGENTS.md refresh).
- **Final:** Regression commands only (no separate docs wave — AGENTS already updated per wave).

### AGENTS.md gate (every wave)

After the implementation todos of a wave pass QA, **before** starting the next wave or calling the wave done:

1. Update only the **related** `AGENTS.md` files listed for that wave (do not mass-rewrite unrelated agent maps).
2. Align facts with code that just landed (APIs, call sites, coalesce rules, test paths).
3. Prefer a dedicated `docs(agents): …` commit at the end of the wave (or fold into the last wave commit if the delta is tiny and still conventional).
4. If a wave is **skipped** (e.g. Wave 2 not needed), do **not** invent AGENTS claims for unshipped work.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | None | 2, 3, 4 | — |
| 2 | 1 | 3, 4 | — |
| 3 | 1 | 4 | 2 (after API types land) |
| 4 | 1–3 | Wave 2 / Final | — |
| 5 | Wave 1 dogfood fail | 6 | — |
| 6 | 5 | Final | — |

---

## Todos

> Implementation + Test = ONE todo where practical.  
> **AGENTS refresh = mandatory wave closer** (Todos 4 and 6), not an end-of-project backlog item.

### Wave 1 — user refresh path

- [ ] 1. Add reason-tagged `forcePoll` with user coalesce bypass  
  What to do / Must NOT do: Extend `forcePoll` in `scheduler/facade.ts` with optional `{ reason?: ForcePollReason }`. When `reason === "user"`, skip the `FORCE_POLL_COALESCE_MS` early-return (still use `runGuardedPoll`, still single-flight coordinator). When coalescing non-user reasons, if `inFlightPoll !== null`, ensure a **queued follow-up** is requested (set `queuedPollRequested` via going through `runGuardedPoll`, not bare return of in-flight). Default reason `"auto"` preserves current behavior for existing callers. Export type if needed. Update `AppGraph.scheduler.forcePoll` signature. Do not change background poll interval arming. Do not remove deferred timer for auto/watch.  
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3, 4  
  References: `src/main/scheduler/facade.ts`; `src/main/composition/app-graph.ts`; `src/main/application/ports/scheduler-port.ts` (keep port narrow if needed); `tests/main/scheduler-facade-force-poll.test.ts`.  
  Acceptance criteria: After a completed auto poll, `forcePoll({ reason: "user" })` calls `refreshCalendarPublication` immediately; `forcePoll()` / `{ reason: "watch" }` within 10s still defers once; stopScheduler still clears deferred timer.  
  QA: `bunx vitest run -c vitest.workspace.ts --project main tests/main/scheduler-facade-force-poll.test.ts`  
  Commit: Y | `fix(scheduler): bypass forcePoll coalesce for user refresh`

- [ ] 2. Wire tray Refresh (and peer UX) to user forcePoll + force rebuild  
  What to do / Must NOT do: In `tray.ts` `menuCallbacks`, `onForcePoll` / `onRetryPoll` await `graph.scheduler.forcePoll({ reason: "user" })` then `requestTrayRebuild(win, { force: true })`. Prefer same for post-Connect grant refresh. Decide explicitly for Darwin left-click: either `"user"` (aggressive freshness) or keep `"auto"` (less thrash) — **document that choice in Wave 1 AGENTS (Todo 4)**; **Refresh must remain `"user"`**. Do not rebuild from stale cache without awaiting poll on Refresh. Do not open popover window.  
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 4  
  References: `src/main/tray.ts`; `src/main/menu/meeting-menu.ts`; `tests/main/tray.test.ts`; `tests/main/meeting-menu.test.ts`.  
  Acceptance criteria: Simulated Refresh with provider sequence event@09:00 then event@18:00 yields second menu build whose label includes the evening time (`formatMeetingTime`); first auto poll + immediate second user refresh invokes two fetches.  
  QA: `bunx vitest run -c vitest.workspace.ts --project main tests/main/tray.test.ts tests/main/meeting-menu.test.ts tests/main/scheduler-facade-force-poll.test.ts`  
  Commit: Y | `fix(tray): await user refresh and force menu rebuild`

- [ ] 3. Regression tests for reschedule signature → menu  
  What to do / Must NOT do: Add focused tests: (a) same `EventId`, new `startDate`/`endDate` → `eventListSignature` / `trayMenuSignature` change; (b) `filterUpcomingMeetings` drops ended 9AM at now=10:00 and includes 18:00 event; (c) user forcePoll path as in todo 1. Prefer domain/main unit tests over live EventKit. If test inventory/layout changes, note it for Todo 4 (`tests/main/AGENTS.md` / `tests/AGENTS.md`).  
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4  
  References: `src/domain/services/event-signature.ts`; `src/domain/services/meeting-time.ts`; `src/main/tray.ts` `trayMenuSignature`; `tests/domain/*`; `tests/main/tray*.test.ts`.  
  Acceptance criteria: Failing before fix (if testing old coalesce path) / passing after; coverage of startDate in signature remains locked.  
  QA: `bunx vitest run -c vitest.workspace.ts --project domain tests/domain/event-signature.test.ts tests/domain/meeting-time.test.ts` and main suite above.  
  Commit: Y | `test: cover tray refresh after reschedule`

- [ ] 4. **Wave 1 closer — refresh related AGENTS.md**  
  What to do / Must NOT do: Update agent maps for **Wave 1 code only**. Touch only files whose claims changed:

  | File | What to document |
  | --- | --- |
  | `src/main/scheduler/AGENTS.md` | `forcePoll` options / `ForcePollReason`; **user bypasses** 10s coalesce; auto/watch/power still coalesce; in-flight still queues follow-up; cancel on stop unchanged |
  | `src/main/composition/AGENTS.md` | `graph.scheduler.forcePoll` option shape + return type |
  | `src/main/application/AGENTS.md` | Only if `SchedulerPort` signature changed; keep port vs graph surface distinction |
  | `src/main/AGENTS.md` | Tray Refresh = user forcePoll + await + force rebuild; left-click reason decision |
  | `src/main/menu/AGENTS.md` | Refresh/Retry still call `MenuCallbacks.onForcePoll` (callback now user-intent); no menu builder changes if none |
  | `AGENTS.md` (root) | Poll 2/4 min unchanged; forcePoll coalesce is **auto/watch**; user Refresh does not coalesce; link this plan if useful |
  | `src/AGENTS.md` | Only if composition/scheduler “where to change” rows need the new option |
  | `tests/main/AGENTS.md` / `tests/AGENTS.md` | New/updated suites for user forcePoll + reschedule menu |

  Do **not** document Wave 2 EventKit `refreshSourcesIfNecessary` until shipped. Do not rewrite unrelated windows/settings/Swift maps.  
  Parallelization: Wave 1 closer | Blocked by: 1–3 | Blocks: Wave 2 / Final  
  Acceptance criteria: An agent reading only these AGENTS files answers correctly: “Does tray Refresh coalesce within 10s?” → **No (user reason)**; “Does watch CHANGED coalesce?” → **Yes**.  
  QA: Grep AGENTS for stale claims (`void forcePoll` as the only Refresh path; “forcePoll always coalesces 10s” without user exception).  
  Commit: Y | `docs(agents): document user forcePoll bypass and tray await rebuild`

### Wave 2 — EventKit freshness (optional)

- [ ] 5. (Optional) EventKit freshness hardening  
  What to do / Must NOT do: Only if dogfood shows live Swift stdout still has old startISO after Calendar.app shows new time and user refresh ran. In `googlemeet-events.swift` one-shot path: call `store.refreshSourcesIfNecessary()` before predicate query; optionally recreate store. Bound any retry (at most one). Do not recompile on semantic exit. Keep 15s/8MiB spawn bounds.  
  Parallelization: Wave 2 | Blocked by: Wave 1 (todos 1–4) + failed dogfood | Blocks: 6  
  References: `src/main/googlemeet-events.swift`; `src/main/calendar/providers/darwin-eventkit.ts`; `src/main/swift/*` tests.  
  Acceptance criteria: Helper returns updated ISO after local Calendar reschedule within N seconds of Refresh in dogfood notes.  
  QA: Manual dogfood + existing Swift/parser tests.  
  Commit: Y | `fix(swift): refresh EventKit sources before query`

- [ ] 6. **Wave 2 closer — refresh related AGENTS.md** (only if Todo 5 ships)  
  What to do / Must NOT do: Update agent maps for **Wave 2 code only**:

  | File | What to document |
  | --- | --- |
  | `src/main/swift/AGENTS.md` | One-shot query: `refreshSourcesIfNecessary` / store reset-or-recreate; any one-shot retry rule; still integrity-only recompile |
  | `src/main/calendar/AGENTS.md` | Darwin provider still spawns helper; note EventKit source refresh is in Swift one-shot (not a JS cache) |
  | `src/main/AGENTS.md` / `AGENTS.md` | One-line note only if root NOTES mention Swift protocol/query behavior |
  | `tests/main/AGENTS.md` | Only if new Swift/parser tests were added |

  Skip this todo entirely if Wave 2 is not implemented.  
  Parallelization: Wave 2 closer | Blocked by: 5 | Blocks: Final  
  Acceptance criteria: AGENTS do not claim EventKit source refresh if code was not merged; if merged, Swift one-shot section matches implementation.  
  QA: Diff AGENTS against `googlemeet-events.swift` one-shot path.  
  Commit: Y | `docs(agents): document EventKit source refresh before query`

---

## Final verification

```bash
bun run typecheck
bunx vitest run -c vitest.workspace.ts --project main \
  tests/main/scheduler-facade-force-poll.test.ts \
  tests/main/tray.test.ts \
  tests/main/meeting-menu.test.ts
bunx vitest run -c vitest.workspace.ts --project domain \
  tests/domain/event-signature.test.ts \
  tests/domain/meeting-time.test.ts
bun run guardrails
```

Manual macOS dogfood checklist above.

Confirm AGENTS for completed waves are current (Wave 1 Todo 4 always; Wave 2 Todo 6 only if Wave 2 shipped).

---

## Risk notes

| Risk | Mitigation |
| --- | --- |
| User spam-click Refresh thrash | Coordinator single-flight + one follow-up still bounds work; optional light debounce only for identical user clicks <300ms if needed later |
| Watch storm if left-click becomes user | Prefer left-click stays `"auto"`; Refresh only is `"user"` |
| Tests assume old void forcePoll | Update mocks to accept optional options object |
| EventKit still laggy | Wave 2; product copy cannot force iCloud to sync faster |
| Stale AGENTS mid-stack | Wave-closer todos 4/6 required before next wave |

---

## Commit sequence (suggested)

**Wave 1**

1. `fix(scheduler): bypass forcePoll coalesce for user refresh`  
2. `fix(tray): await user refresh and force menu rebuild`  
3. `test: cover tray refresh after reschedule`  
4. `docs(agents): document user forcePoll bypass and tray await rebuild`

**Wave 2 (optional)**

5. `fix(swift): refresh EventKit sources before query`  
6. `docs(agents): document EventKit source refresh before query`
