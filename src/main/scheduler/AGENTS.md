# Scheduler — Auto-Open Browser Before Meetings

Core scheduling engine for polling Calendar, scheduling per-event timers, updating tray countdowns, showing full-screen alerts, and opening meeting URLs. External code imports only `facade.ts`; internal modules may cross-import each other directly.

## Files

| File                 | Role                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `facade.ts`          | Sole public entry. Owns `startScheduler`, `stopScheduler`, `restartScheduler`, `forcePoll`, dependency injection, `cancelPendingBrowserOpen`, and force-poll coalescing state. |
| `index.ts`           | `scheduleEvents(events)` — builds snapshot, calls pure `planSchedule`, then `interpretSchedulePlan`.                                                                          |
| `core/plan-schedule.ts` | Pure scheduling decisions (no Electron / timers).                                                                                                                           |
| `adapters/interpret-schedule.ts` | Applies `SchedulePlan` actions (arm/cancel timers, prune).                                                                                                           |
| `poll.ts`            | Fetches calendar, hashes event list, emits `meeting-list-updated`, calls `reportCalendarPollError` on failure, pushes `CALENDAR_EVENTS_UPDATED`. |
| `poll.ts`            | Fetches calendar, `recordCalendarResult`, schedules timers, emits `meeting-list-updated`, hash-gates renderer push.                                                             |
| `state/`             | Internal sliced state; see `state/AGENTS.md`. External imports forbidden.                                                                                                      |
| `browser-timer.ts`   | Browser-open timer; optional native Notification; dynamic body; late-join grace cutoff marks fired without open.                                                               |
| `alert-timer.ts`     | Full-screen alert timer: `alertLeadSeconds` before browser open; passes `autoOpenAt` into `showAlert`.                                                                         |
| `title-countdown.ts` | 30-minute tray title window; `cancelledEvents` is title-bookkeeping only.                                                                                                       |
| `countdown.ts`       | In-meeting title countdown and active event resolution.                                                                                                                        |

## Public API (`facade.ts` only)

| Function                        | Contract                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `startScheduler()`              | Bumps `pollEpoch`, runs initial `poll()`, arms recursive polling timeout.             |
| `stopScheduler()`               | Cancels pending force poll, resets resources preserving window, clears tray title.    |
| `restartScheduler()`            | Stop then start; used for timing settings changes and wake events.                    |
| `forcePoll()`                   | Immediate poll with 10s completed-poll coalescing; deferred extra request fires once. |
| `setSchedulerWindow(w)`         | Injects BrowserWindow for typed push channels.                                        |
| `setTrayTitleCallback(fn)`      | Injects tray title updater; scheduler never imports tray.                             |
| `initPowerCallbacks(callbacks)` | Injects poll interval and sleep-prevention hooks from `system/power.ts`.              |
| `getLastKnownEvents()`          | Returns last calendar result for join/hotkey logic.                                   |
| `cancelPendingBrowserOpen(id)`  | Cancels browser timer and marks event fired (alert dismiss **and** successful join).  |
| `_resetForceTestState()`        | Test-only reset for facade coalescing timers.                                         |

## Timing / settings

- Poll interval: 2 minutes on AC, 4 minutes on battery.
- Open-before: `settings.openBeforeMinutes` (**0–10**; 0 = at start).
- Auto-open gated by `settings.autoOpenEnabled`.
- Alert lead: `settings.alertLeadSeconds` (default 60) before browser open.
- Native notifications gated by `settings.nativeNotifications` and quiet hours.
- Quiet hours: suppress **alert show + Notification** only; auto-open continues.
- Late-join: `settings.lateJoinGraceMinutes` (default 0 = off); schedule path may arm delay-0 open for in-progress meetings; re-poll preserves pending browser timer.
- Title countdown window: 30 minutes before start.
- Schedule-ahead cap: 24 hours.
- Force-poll coalesce: 10 seconds after last completed poll.
- Consecutive errors threshold 3; counter caps at 4.

## Rules

- Outside scheduler, import from `scheduler/facade.js` only.
- Inside scheduler, do not import from `facade.js` (cycles).
- Do not expose raw mutable Maps/Sets outside `state/`.
- Auto-open suppression uses **`firedEvents` / `cancelPendingBrowserOpen` only** — never title-countdown `cancelledEvents`.
- Browser open goes through `openMeetingUrl()` / `buildMeetUrl()`.
- Alert dismissal and successful `joinMeetingById` both mark opened via facade.
