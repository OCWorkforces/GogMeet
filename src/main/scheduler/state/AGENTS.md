# Scheduler State — Sliced State Composition

Internal state for the scheduler subsystem, split into 4 slices composed by `index.ts`. Files here are private to `scheduler/` (enforced by `.sentrux/rules.toml` rule `state-internal-only`).

## FILES

| File               | Role                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| `index.ts`         | Composition root: `SchedulerState` interface, `createSchedulerState()` factory, singleton, `replaceState()`, getters/setters |
| `state-cleanup.ts` | Scheduler state cleanup helpers: stale timer pruning, bulk resource cleanup, in-meeting timer cleanup |
| `state-timers.ts`  | 8 timer Maps (timers, alertTimers, titleTimers, countdownIntervals, clearTimers, inMeetingIntervals, inMeetingEndTimers, scheduledEventData) + `clearAllTimers()`, `createTimersState()` |
| `state-display.ts` | Tray display scalars: `activeTitleEventId`, `activeInMeetingEventId`, `titleDirty`, `inMeetingDirty` + `createDisplayState()` |
| `state-poll.ts`    | Poll metadata: `pollTimeout`, `pollEpoch`, `consecutiveErrors`, `lastKnownEvents` + `createPollState()` |
| `state-runtime.ts` | Runtime callbacks: `win` (BrowserWindow \| null), `onTrayTitleUpdate`, `powerCallbacks` + `createRuntimeState()` |

## WHERE TO LOOK

| Task                              | Location                                       |
| --------------------------------- | ---------------------------------------------- |
| Add a new timer Map               | `state-timers.ts` → extend `TimersState`       |
| Add a tray-display scalar         | `state-display.ts` → extend `DisplayState`     |
| Tweak error cap / poll race guard | `state-poll.ts`                                |
| Wire a new runtime callback       | `state-runtime.ts` → extend `RuntimeState`     |
| Compose a new slice               | `index.ts` → spread into `createSchedulerState()` |

## NOTES

- Slices compose via spread in `createSchedulerState()`: `{ ...createTimersState(), ...createDisplayState(), ...createPollState(), ...createRuntimeState() }`. `SchedulerState` extends all 4 slice interfaces.
- `replaceState()` calls `clearAllTimers()` and resets snapshot, but **preserves** `win`, `onTrayTitleUpdate`, and `powerCallbacks` from the old state per the parent AGENTS.md contract.
- `pollEpoch` is a race-condition guard. Stale callbacks from previous scheduler instances must check the current epoch via the getter before executing, otherwise they're silently discarded.
- `incrementConsecutiveErrors()` caps `consecutiveErrors` at `MAX_CONSECUTIVE_ERRORS_CAP` (4) to prevent unbounded growth after the error handler fires.
- All external access goes through getter/setter functions exported from `index.ts`. Never reach into raw Maps from outside `scheduler/`.
- These files are INTERNAL. Importing `state/*` from outside `scheduler/` violates `state-internal-only` in `.sentrux/rules.toml`.
