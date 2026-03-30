# Scheduler — Auto-Open Browser Before Meetings

Core scheduling engine. Manages per-event `setTimeout` timers (8 types), calendar polling, tray title countdown, and full-screen alert timing.

## FILES

| File           | Lines | Role                                                   |
| -------------- | ----- | ------------------------------------------------------ |
| `index.ts`     | 498   | Core scheduling engine, timer orchestration, lifecycle |
| `state.ts`     | 196   | Singleton state with Proxy views over Maps/Sets        |
| `countdown.ts` | 138   | Tray title ownership resolution, in-meeting countdown  |

## PUBLIC API

| Function               | Signature                          | Role                                          |
| ---------------------- | ---------------------------------- | --------------------------------------------- |
| `startScheduler`       | `() => void`                       | Starts 2-min poll loop + first poll           |
| `stopScheduler`        | `(preserveWindow?) => void`        | Clears all timers, resets state               |
| `restartScheduler`     | `() => void`                       | stop + start (settings changes)               |
| `scheduleEvents`       | `(events: MeetingEvent[]) => void` | Central hub: sets/resets per-event timers     |
| `poll`                 | `() => Promise<void>`              | Fetches calendar, delegates to scheduleEvents |
| `setSchedulerWindow`   | `(w: BrowserWindow) => void`       | Injects renderer window for IPC push          |
| `setTrayTitleCallback` | `(fn) => void`                     | Decouples scheduler from tray                 |

## CONSTANTS

| Constant                 | Value   | Purpose                               |
| ------------------------ | ------- | ------------------------------------- |
| `getOpenBeforeMs()`      | 1-5 min | Configurable via settings             |
| `TITLE_BEFORE_MS`        | 30 min  | Tray title activation window          |
| `POLL_INTERVAL_MS`       | 2 min   | Calendar re-fetch interval            |
| `MAX_SCHEDULE_AHEAD_MS`  | 24 h    | Skip events beyond this               |
| `MAX_CONSECUTIVE_ERRORS` | 3       | ~6 min of errors before clearing tray |
| `ALERT_OFFSET_MS`        | 60 s    | Alert fires 1 min before browser      |

## TIMER TYPES (8 Maps)

| Map                  | Mechanism     | Fires When                              |
| -------------------- | ------------- | --------------------------------------- |
| `timers`             | `setTimeout`  | `startMs - openBeforeMinutes` (browser) |
| `alertTimers`        | `setTimeout`  | `startMs - openBeforeMinutes - 60s`     |
| `titleTimers`        | `setTimeout`  | `startMs - 30min` (title activation)    |
| `countdownIntervals` | `setInterval` | Every 60s while in 30-min window        |
| `clearTimers`        | `setTimeout`  | At `startMs` → switch to in-meeting     |
| `inMeetingIntervals` | `setInterval` | Every 60s during meeting                |
| `inMeetingEndTimers` | `setTimeout`  | At `endMs` → cleanup                    |
| `scheduledEventData` | Map           | Snapshot for change detection           |

Plus 2 Sets: `firedEvents` (prevents browser re-open), `alertFiredEvents` (prevents alert re-show).

## EVENT LIFECYCLE

```
[Event appears in calendar]
  → scheduleEvents called
  → if >30 min out: titleTimer scheduled
  → if <30 min: countdown starts immediately
  → alertTimer fires → full-screen overlay (if windowAlert on)
  → browser timer fires → Notification + shell.openExternal
  → meeting starts → inMeetingCountdown begins
  → meeting ends → all timers cleared
```

## STATE ARCHITECTURE (state.ts)

**Proxy view pattern**: Module exports Proxy-wrapped Maps/Sets over a singleton `SchedulerState` object. Callers like `timers.get(id)` always reflect current state.

**Dual scalar export**: Each scalar (`activeTitleEventId`, `activeInMeetingEventId`, `consecutiveErrors`) exists both as a property on `state` AND as a module-level `let`. `syncExportedScalars()` keeps them in sync after `replaceState()`.

**State primitives**: `setActiveTitleEventId()`, `setActiveInMeetingEventId()`, `setConsecutiveErrors()`, `incrementConsecutiveErrors()` — mutators that sync scalars.

**Reset**: `resetState({ preserveWindow? })` clears all resources, replaces with fresh state. `replaceState()` swaps entire state (testing).

## COUNTDOWN LOGIC (countdown.ts)

- `resolveActiveTitleEvent()`: Picks earliest-starting event from `countdownIntervals` to own tray title
- `resolveActiveInMeetingEvent()`: Picks soonest-ending in-meeting event to own tray title
- `startInMeetingCountdown()`: Per-minute tick + end-of-meeting clear timer
- `clearAllDisplayTimers()`: Wipes all countdown/clear/inMeeting timers (on consecutive errors)

## DESIGN DECISIONS

- **Callback decoupling**: `setTrayTitleCallback` breaks scheduler→tray dependency; scheduler never imports tray
- **Idempotent scheduling**: `scheduleEvents` safe to call repeatedly; cleans stale entries and compares snapshots
- **Change detection**: `scheduledEventData` Map stores title/url/startMs/endMs per event; reschedules only on actual change
- **Alert pre-fire suppression**: `alertFiredEvents` Set prevents re-showing alert on scheduler refresh

## INTERNAL DEPENDENCIES

```
index.ts
  ├── state.ts        (state maps, scalars, reset primitives)
  ├── countdown.ts    (title/in-meeting resolution)
  ├── ../calendar.ts  (getCalendarEventsResult)
  ├── ../alert-window.ts (showAlert)
  ├── ../settings.ts  (getSettings)
  ├── ../utils/meet-url.ts (buildMeetUrl)
  └── ../../shared/ipc-channels.ts (IPC_CHANNELS)
```
