# Scheduler State — Sliced State Composition

Internal state for the scheduler subsystem, split into slices composed by `index.ts`. Files here are private to `scheduler/` (enforced by `.sentrux/rules.toml` rule `state-internal-only`).

## FILES

| File | Role |
| --- | --- |
| `index.ts` | Composition root: `SchedulerState` interface, `createSchedulerState()` factory, singleton, `replaceState()`, getters/setters |
| `state-cleanup.ts` | Stale timer pruning, bulk resource cleanup, in-meeting timer cleanup |
| `state-timers.ts` | Timer-handle Maps, `scheduledEventData` snapshots, fired/cancelled suppression state |
| `state-display.ts` | Tray display scalars: `activeTitleEventId`, `activeInMeetingEventId`, dirty flags |
| `state-poll.ts` | Poll metadata: `pollTimeout`, `pollEpoch`, `consecutiveErrors`, `lastKnownEvents` |
| `state-runtime.ts` | Runtime callbacks: `win`, `onTrayTitleUpdate`, `powerCallbacks` |

## WHERE TO LOOK

| Task | Location |
| --- | --- |
| Add a new timer Map | `state-timers.ts` → extend `TimersState` |
| Add a tray-display scalar | `state-display.ts` → extend `DisplayState` |
| Tweak error cap / poll race guard | `state-poll.ts` |
| Wire a new runtime callback | `state-runtime.ts` → extend `RuntimeState` |
| Compose a new slice | `index.ts` → spread into `createSchedulerState()` |

## NOTES

- Slices compose via spread in `createSchedulerState()`: `{ ...createTimersState(), ...createDisplayState(), ...createPollState(), ...createRuntimeState() }`.
- `replaceState()` snapshots refs, calls `clearSchedulerResources`, restores runtime + optional fired state.
- `firedEvents` / `alertFiredEvents` suppress browser open / alert re-fire. **`cancelledEvents` is title-countdown bookkeeping only**.
- `pollEpoch` is a race-condition guard for stale callbacks.
- `incrementConsecutiveErrors()` caps at `MAX_CONSECUTIVE_ERRORS_CAP` (4).
- All external access goes through getter/setter functions from `index.ts`. Never reach into raw Maps from outside `scheduler/`.
- Importing `state/*` from outside `scheduler/` violates `state-internal-only`.
