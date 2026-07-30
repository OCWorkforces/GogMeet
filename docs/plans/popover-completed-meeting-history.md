# popover-completed-meeting-history - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** An optional Settings switch for showing today's completed meetings in the popover. When enabled, completed meetings appear as muted history that cannot be joined; when disabled, the popover works exactly as it does today.

**Why this approach:** The app already receives today's completed events, so the change remains presentation-focused. A small renderer timer updates history at meeting end and midnight without creating calendar polls or changing automation.

**What it will NOT do:** It will not change automatic opening, joining, calendar providers, tray menus, offline-cache retention, or show meetings from previous days.

**Effort:** Medium
**Risk:** Medium - The feature crosses persisted settings and time-driven rendering, but it has no scheduler or provider changes.
**Decisions to sanity-check:** The new switch defaults to off, history is newest-ended first, and it disappears at local midnight.

Your next move: start the plan in a worker session or request a high-accuracy review. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, medium risk; add an opt-in v3 persisted setting plus renderer-only completed-today history and temporal invalidation.

## Scope
### Must have
- Add `showCompletedTodayMeetings: boolean` to `AppSettings`, defaulted to `false`, with schema version 3 migration and persisted rewrite of earlier settings files.
- Expose a correctly labelled, persisted Settings-page toggle using the existing switch and save-indicator patterns.
- When the preference is enabled, render a `Completed today` section after actionable rows for events whose local start and local end both fall in `[startOfDay(now), startOfTomorrow())` and whose end is at or before `now`.
- Sort history newest-ended first. Render title, `Ended`, and calendar metadata with escaping; make rows visually muted and structurally non-interactive.
- Maintain one renderer-owned presentation timer for the earliest of: the next strictly future event end or the next local midnight. Its callback must render/re-arm locally without calendar/settings/join IPC, scheduler activity, or footer freshness changes.
- React to the display-toggle `settings:changed` push with a local render/re-arm; preserve the existing refresh behavior for every other setting.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not add an IPC channel, change sender validation, or create a new data transfer path. The existing typed `AppSettings` payload may gain the field.
- Do not add the setting to `TIMING_KEYS`, restart the scheduler, or force a calendar poll when it changes.
- Do not modify providers, calendar query windows, `CalendarResult`, scheduler logic, automatic browser opening, join use cases, tray/menu rendering, or offline-cache pruning/format.
- Do not render a fake disabled Join button, a `data-action`, an event ID, an auto-open badge, or a focusable control in a completed row.
- Do not retain or browse completed meetings from preceding days, including overnight and prior-day-spanning events.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after with Vitest workspace projects, fake timers, and jsdom DOM assertions.
- Evidence: `.omo/evidence/task-<N>-popover-completed-meeting-history.txt` for each targeted command; screenshot/automation evidence under `.omo/evidence/task-6-popover-completed-meeting-history/`.
- Temporal tests freeze a local timestamp and explicitly advance timers through event-end and midnight boundaries. They assert effects and non-effects (especially no calendar fetch or scheduler calls).

## Execution strategy
### Parallel execution waves
- Wave 1: Todos 1, 2, and 3 can proceed in parallel after agreeing on the exact setting field name/default.
- Wave 2: Todo 4 depends on Todo 1; Todo 5 depends on Todos 1 and 4; Todo 6 depends on Todos 2, 3, 4, and 5.
- Final verification runs only after every implementation todo passes its local QA.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | None | 2, 3, 4, 5, 6 | 2, 3 |
| 2 | 1 | 6 | 3, 4 |
| 3 | 1 | 6 | 2, 4 |
| 4 | 1 | 5, 6 | 2, 3 |
| 5 | 1, 4 | 6 | None |
| 6 | 2, 3, 4, 5 | Final wave | None |

## Todos
> Implementation + Test = ONE todo. Never separate.
- [ ] 1. Add the opt-in completed-history settings contract and v3 migration
  What to do / Must NOT do: Add `showCompletedTodayMeetings` to `AppSettings` and `DEFAULT_SETTINGS` with default `false`; advance `SETTINGS_SCHEMA_VERSION` from 2 to 3; parse invalid/missing values as the default; update the JSON-store partial update path; migrate/rewrite pre-v3 files. Update all explicit full-settings fixtures/helpers. Do not alter unrelated defaults or accept non-booleans.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3, 4, 5, 6
  References (executor has NO interview context - be exhaustive): `src/domain/entities/settings.ts`; `src/domain/services/settings-parse.ts`; `src/main/infrastructure/settings/json-settings-store.ts`; `tests/main/json-settings-store.test.ts`; `tests/helpers/test-utils.ts`; `tests/renderer/settings.test.ts`.
  Acceptance criteria (agent-executable): A new install and a parsed v2 settings file both produce `showCompletedTodayMeetings: false` with schema v3; an explicit true survives load, update, save, and fresh-store reload; malformed values resolve to false.
  QA scenarios (name the exact tool + invocation): Happy: `bunx vitest run -c vitest.workspace.ts --project domain tests/domain/settings-defaults.test.ts tests/domain/settings-parse.test.ts` and `bunx vitest run -c vitest.workspace.ts --project main tests/main/json-settings-store.test.ts`. Failure: fixture files with missing/invalid field and v2 schema assert default/rewrite behavior. Evidence `.omo/evidence/task-1-popover-completed-meeting-history.txt`.
  Commit: Y | feat(settings): persist completed history preference
- [ ] 2. Add the accessible Settings-page display toggle
  What to do / Must NOT do: Add one `Show completed meetings` switch in Meeting Preferences, with an accurate description, `for`/input ID, switch `aria-checked`, save indicator, and existing async rollback behavior. Register it via `setupToggleListener` and make `buildTogglePatch` exhaustive for the new boolean. Do not refactor unrelated switches or change global styling.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 6
  References (executor has NO interview context - be exhaustive): `src/renderer/settings/index.ts:56-215,296-382`; `src/renderer/settings/styles.css`; `tests/renderer/settings.test.ts`; `src/domain/entities/settings.ts`.
  Acceptance criteria (agent-executable): The rendered switch reflects false/true from settings; keyboard/change interaction sends exactly `{ showCompletedTodayMeetings: boolean }`; success retains state and shows saved feedback; rejected or mismatched saves restore its previous checked and ARIA state.
  QA scenarios (name the exact tool + invocation): Happy: `bunx vitest run -c vitest.workspace.ts --project renderer tests/renderer/settings.test.ts`. Failure: mock `settings.set` rejection and a response that does not preserve the requested value; assert rollback. Evidence `.omo/evidence/task-2-popover-completed-meeting-history.txt`.
  Commit: Y | feat(settings): add completed meetings toggle
- [ ] 3. Keep the display-only setting out of scheduler work
  What to do / Must NOT do: Extend the existing typed settings flow only as required by the new AppSettings field. Add main IPC-handler regression coverage that setting this field persists and broadcasts existing `SETTINGS_CHANGED`, but invokes neither `graph.scheduler.restart()` nor `graph.scheduler.forcePoll()`. Do not add it to `TIMING_KEYS`, special-case it with a new channel, or weaken sender validation.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 6
  References (executor has NO interview context - be exhaustive): `src/main/ipc-handlers/settings.ts:8-55`; `src/shared/ipc-channels.ts`; `src/main/composition/app-graph.ts`; `tests/main/ipc-handlers-settings.test.ts`; `tests/helpers/ipc-sender.ts`.
  Acceptance criteria (agent-executable): An authorized `SETTINGS_SET` with only the new field returns/broadcasts the updated setting once; scheduler restart and force-poll mocks remain uncalled. Existing timing and tomorrow-setting tests continue to demonstrate their current restart/force-poll paths.
  QA scenarios (name the exact tool + invocation): Happy and failure/authorization: `bunx vitest run -c vitest.workspace.ts --project main tests/main/ipc-handlers-settings.test.ts`. Evidence `.omo/evidence/task-3-popover-completed-meeting-history.txt`.
  Commit: Y | test(ipc): guard display preference scheduler isolation
- [ ] 4. Render opt-in completed-today history as non-interactive popover rows
  What to do / Must NOT do: In the popover body renderer, create local-day classification using existing `startOfDay`/`startOfTomorrow` helpers or an equivalent pure renderer helper. With the toggle off, retain current upcoming and completed-only empty-state behavior. With it on, partition active/upcoming and eligible completed rows, sort completed rows by descending end, append a `Completed today` section, and render muted history rows. Preserve escaped title/calendar fields. Do not change tray rows, join delegation, providers, cache, or the active/upcoming row markup.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5, 6
  References (executor has NO interview context - be exhaustive): `src/renderer/rendering/body.ts:8-130`; `src/domain/services/time.ts:31-42`; `src/renderer/styles/main.css`; `src/renderer/events/delegation.ts:9-33`; `tests/renderer/rendering/body.test.ts:102-177,194-252,304-315`.
  Acceptance criteria (agent-executable): Enabled history includes only events with both local timestamps today and `endDate <= now`; it excludes previous-day, overnight, tomorrow, in-progress, and future events. Completed rows contain escaped metadata and `Ended`, but no Join button, `data-action`, `data-event-id`, Auto badge, or focusable descendant. Active/upcoming rows retain their existing behavior.
  QA scenarios (name the exact tool + invocation): Happy: `bunx vitest run -c vitest.workspace.ts --project renderer tests/renderer/rendering/body.test.ts`. Failure boundaries: frozen local time for exact end, midnight, prior-day spanning, tomorrow, missing URL, and malicious title/calendar strings; assert no join affordance and deterministic newest-ended ordering. Evidence `.omo/evidence/task-4-popover-completed-meeting-history.txt`.
  Commit: Y | feat(popover): show optional completed meeting history
- [ ] 5. Add lifecycle-safe renderer temporal invalidation
  What to do / Must NOT do: In the popover entrypoint, maintain one presentation timeout. On every state/settings render decision, clear the old timeout and schedule the earliest valid future event-end deadline or next local midnight while history is enabled; on firing, render/re-arm from current renderer state only. Reset/clear it for non-event state or toggle off. Preserve `lastUpdatedAt`, and never route this timer through `loadEvents` or main APIs.
  Parallelization: Wave 2 | Blocked by: 1, 4 | Blocks: 6
  References (executor has NO interview context - be exhaustive): `src/renderer/index.ts:18-43,53-88,105-127,132-194`; `src/renderer/lib/apply-events-push.ts`; `src/domain/services/time.ts:31-42`; `tests/renderer/main-ui.test.ts:31-117`.
  Acceptance criteria (agent-executable): Advancing fake time across an event end moves the item from active/upcoming to history without a new publication; multiple ends re-arm once for the next deadline; local midnight removes prior-day history; toggle off clears the timer. Timer callbacks make zero `calendar.getEvents`, `settings.get`, `settings.set`, and `app.joinMeeting` calls and do not alter footer freshness.
  QA scenarios (name the exact tool + invocation): Happy and failure: `bunx vitest run -c vitest.workspace.ts --project renderer tests/renderer/main-ui.test.ts`, using fake timers and callback-captured settings publications. Assert no duplicate timer behavior after repeated pushes/settings changes and no calls to calendar/scheduler-facing mocks. Evidence `.omo/evidence/task-5-popover-completed-meeting-history.txt`.
  Commit: Y | feat(popover): refresh completed history on time boundaries
- [ ] 6. Verify cross-layer behavior and user-visible rendering
  What to do / Must NOT do: Run the focused settings/main/renderer suites together, inspect changed source boundaries, and use the project’s Electron/browser automation path to render the Settings toggle and enabled/disabled popover fixtures. Capture screenshot evidence of the muted completed section and no join affordance. Do not add docs, screenshots to the repository, or production behavior beyond the prior todos.
  Parallelization: Wave 2 | Blocked by: 2, 3, 4, 5 | Blocks: final verification
  References (executor has NO interview context - be exhaustive): `tests/renderer/settings.test.ts`; `tests/renderer/rendering/body.test.ts`; `tests/renderer/main-ui.test.ts`; `tests/main/json-settings-store.test.ts`; `tests/main/ipc-handlers-settings.test.ts`; project scripts in `package.json`.
  Acceptance criteria (agent-executable): All focused tests pass; automated UI proves toggle-off preserves the existing all-done presentation and toggle-on shows muted completed history; inspection confirms no provider, scheduler, tray, join, or offline-cache source files changed.
  QA scenarios (name the exact tool + invocation): Happy: targeted Vitest commands from Todos 1-5 plus agent-browser/Electron automation using IDs `show-completed-meetings-toggle` and a completed-history row class. Failure: toggle-off and prior-day fixture show no history. Evidence `.omo/evidence/task-6-popover-completed-meeting-history/`.
  Commit: N | verified with final feature commit

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
  Verify every completed implementation task against its Must have/Must NOT have contract, diff, cited test evidence, and dependency matrix. Reject missing settings migration, UI state persistence, local-only timer behavior, or scope-boundary proof.
- [ ] F2. Code quality review
  Review changed TypeScript/CSS/tests for type safety, escaping, exact optional-property semantics, timer cleanup, accessibility, and adherence to the existing settings toggle patterns. Run `bun run typecheck`, `bun run lint`, and `bun run format:check`.
- [ ] F3. Real manual QA
  Use agent-executed Electron/browser automation only: capture Settings toggle off/on and popover fixtures before/after an event end and midnight; verify disabled history appearance and no action controls. Save artifacts under `.omo/evidence/f3-popover-completed-meeting-history/`.
- [ ] F4. Scope fidelity
  Inspect the diff and run `bun run guardrails`; confirm no changes to provider queries, scheduler automation, tray/menu behavior, join use cases, calendar DTOs, or offline-cache retention.

## Commit strategy
- Prefer three atomic commits: settings contract/migration; Settings UI plus scheduler-isolation tests; popover history/timer plus renderer tests. Keep any test-only cleanup with its behavioral change.
- Do not commit plan or evidence artifacts unless the repository convention explicitly requires them.

## Success criteria
- Existing users retain the current popover after upgrade because `showCompletedTodayMeetings` defaults to false and v2 settings migrate to v3.
- Users can enable/disable the persisted setting in Settings, and a failed save visibly rolls the toggle back.
- Enabled popovers show only fully completed, same-local-day meetings as muted, newest-first history with no join/action affordance.
- At a meeting end and at local midnight, the open popover updates without a calendar fetch, scheduler action, join request, or footer freshness change.
- All focused tests and final quality gates pass, and scope checks prove calendar, scheduler, tray, join, and offline-cache behavior stayed unchanged.
