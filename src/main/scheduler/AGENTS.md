# Scheduler — Auto-Open Browser Before Meetings

Core scheduling engine for polling Calendar, scheduling per-event timers, updating tray countdowns, showing full-screen alerts, and opening meeting URLs. External code imports only `facade.ts`; internal modules may cross-import each other directly.

## Files

| File | Role |
| --- | --- |
| `facade.ts` | Sole public entry. Owns `startScheduler`, `stopScheduler`, `restartScheduler`, `forcePoll`, dependency injection, `cancelPendingBrowserOpen`, and force-poll coalescing state. |
| `index.ts` | `scheduleEvents(events)`; central scheduling hub and stale-entry pruning. |
| `poll.ts` | Fetches calendar, hashes event list, emits `meeting-list-updated`, pushes `CALENDAR_EVENTS_UPDATED`. |
| `state/` | Internal sliced state; see `state/AGENTS.md`. External imports forbidden. |
| `browser-timer.ts` | Browser-open timer and notification trigger. |
| `alert-timer.ts` | Full-screen alert timer: 60s after the browser-open offset (`openBeforeMinutes - 1`, clamped at now). |
| `title-countdown.ts` | 30-minute tray title window and cancelled-title tracking. |
| `countdown.ts` | In-meeting title countdown and active event resolution. |

## Public API (`facade.ts` only)

| Function | Contract |
| --- | --- |
| `startScheduler()` | Bumps `pollEpoch`, runs initial `poll()`, arms recursive polling timeout. |
| `stopScheduler()` | Cancels pending force poll, resets resources preserving window, clears tray title. |
| `restartScheduler()` | Stop then start; used for settings changes and wake events. |
| `forcePoll()` | Immediate poll with 10s completed-poll coalescing; deferred extra request fires once. |
| `setSchedulerWindow(w)` | Injects BrowserWindow for typed push channels. |
| `setTrayTitleCallback(fn)` | Injects tray title updater; scheduler never imports tray. |
| `initPowerCallbacks(callbacks)` | Injects poll interval and sleep-prevention hooks from `system/power.ts`. |
| `getLastKnownEvents()` | Returns last calendar result for global shortcut logic. |
| `cancelPendingBrowserOpen(id)` | Cancels browser timer and marks event fired after alert dismissal. |
| `_resetForceTestState()` | Test-only reset for facade coalescing timers. |

## State model

- `state/index.ts` composes state from `state-timers.ts`, `state-display.ts`, `state-poll.ts`, and `state-runtime.ts`.
- Timer maps are keyed by branded `EventId`: browser timers, alert timers, title timers, countdown intervals, clear timers, in-meeting intervals, in-meeting end timers, scheduled snapshots.
- Fired maps (`firedEvents`, `alertFiredEvents`) store TTLs; `cancelledEvents` prevents title timers from re-registering after dismissal.
- Getter helpers expose readonly views; mutation goes through helpers such as `markTitleDirty()`, `incrementConsecutiveErrors()`, and `cancelStaleEntries()`.
- `replaceState()` clears old resources but preserves runtime refs (`win`, tray callback, power callbacks, last-known events) unless explicitly reset.

## Timing constants

- Poll interval: 2 minutes on AC, 4 minutes on battery (`system/power.ts`).
- Open-before window: settings-controlled 1–5 minutes.
- Alert offset: 60 seconds before browser open.
- Title countdown window: 30 minutes before start.
- Schedule-ahead cap: 24 hours.
- Force-poll coalesce: 10 seconds after last completed poll.
- Consecutive error threshold is 3; stored counter caps at 4.

## Rules

- Outside scheduler, import from `scheduler/facade.js` only.
- Inside scheduler, do not import from `facade.js`; that creates cycles.
- Do not expose raw mutable Maps/Sets outside `state/`.
- `pollEpoch` guards stale async callbacks after restart/force-poll.
- `poll.ts` must push renderer event updates only when the event-list hash changes.
- Browser open goes through `openMeetingUrl()` / `buildMeetUrl()`, never direct shell calls.
- Alert dismissal must call `cancelPendingBrowserOpen()` so browser auto-open does not still fire.
