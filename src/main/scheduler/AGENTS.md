# Scheduler — Auto-Open Browser Before Meetings

Core scheduling engine. Manages per-event `setTimeout` timers (8 types), calendar polling, tray title countdown, and full-screen alert timing.

## FILES

| File                 | Role                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `index.ts`           | Central hub: `scheduleEvents()` sets/resets per-event timers               |
| `state.ts`           | Singleton state with Proxy views over Maps/Sets, dirty flags               |
| `countdown.ts`       | In-meeting countdown, title resolution                                     |
| `poll.ts`            | Calendar polling loop, `startScheduler`/`stopScheduler`/`restartScheduler` |
| `alert-timer.ts`     | `scheduleAlertTimer()` — fires 60s before browser open                     |
| `browser-timer.ts`   | `scheduleBrowserTimer()` — browser open + Notification                     |
| `title-countdown.ts` | `scheduleTitleCountdown()` — 30-min window title timer                     |

## PUBLIC API

| Function               | Signature                          | Role                                                    |
| ---------------------- | ---------------------------------- | ------------------------------------------------------- |
| `startScheduler`       | `() => void`                       | Starts poll loop (AC: 2min, battery: 4min) + first poll |
| `stopScheduler`        | `(preserveWindow?) => void`        | Clears all timers, resets state                         |
| `restartScheduler`     | `() => void`                       | stop + start (settings changes)                         |
| `scheduleEvents`       | `(events: MeetingEvent[]) => void` | Central hub: sets/resets per-event timers               |
| `poll`                 | `() => Promise<void>`              | Fetches calendar, delegates to scheduleEvents           |
| `setSchedulerWindow`   | `(w: BrowserWindow) => void`       | Injects renderer window for IPC push                    |
| `setTrayTitleCallback` | `(fn) => void`                     | Decouples scheduler from tray                           |

## CONSTANTS

| Constant                 | Value   | Purpose                                 |
| ------------------------ | ------- | --------------------------------------- |
| `getOpenBeforeMs()`      | 1-5 min | Configurable via settings               |
| `getPollInterval()`      | 2/4 min | 2 min AC, 4 min battery (from power.ts) |
| `TITLE_BEFORE_MS`        | 30 min  | Tray title activation window            |
| `MAX_SCHEDULE_AHEAD_MS`  | 24 h    | Skip events beyond this                 |
| `MAX_CONSECUTIVE_ERRORS` | 3       | ~6 min of errors before clearing tray   |
| `ALERT_OFFSET_MS`        | 60 s    | Alert fires 1 min before browser        |

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

**Dirty flags**: `titleDirty` and `inMeetingDirty` track when title resolution needs re-run. `markTitleDirty(id)` / `markInMeetingDirty(id)` set flags; resolvers clear them after processing.

**State primitives**: `setActiveTitleEventId()`, `setActiveInMeetingEventId()`, `setConsecutiveErrors()`, `incrementConsecutiveErrors()` — mutators that sync scalars.

**Reset**: `resetState({ preserveWindow? })` clears all resources, replaces with fresh state. `replaceState()` swaps entire state (testing).

## DESIGN DECISIONS

- **Callback decoupling**: `setTrayTitleCallback` breaks scheduler→tray dependency; scheduler never imports tray
- **Idempotent scheduling**: `scheduleEvents` safe to call repeatedly; cleans stale entries and compares snapshots
- **Change detection**: `scheduledEventData` Map stores title/url/startMs/endMs per event; reschedules only on actual change
- **Dirty flag resolution**: `titleDirty`/`inMeetingDirty` flags avoid redundant resolver runs when nothing changed
- **Alert pre-fire suppression**: `alertFiredEvents` Set prevents re-showing alert on scheduler refresh
- **Module extraction**: Timer logic split into focused files (poll, alert-timer, browser-timer, title-countdown) from monolithic index.ts

## INTERNAL DEPENDENCIES

```
index.ts
  ├── state.ts          (state maps, scalars, dirty flags, reset primitives)
  ├── countdown.ts      (in-meeting resolution, dirty flag consumers)
  ├── alert-timer.ts    (→ alert-window.ts showAlert)
  ├── browser-timer.ts  (→ utils/meet-url.ts buildMeetUrl)
  ├── title-countdown.ts (→ countdown.ts, state.ts, power.ts)
  └── poll.ts           (→ calendar.ts, state.ts, countdown.ts, index.ts)
```
