# Timer Management Loop Record

This record captures the bounded loop used to improve timer management across the scheduler and adjacent timer surfaces.

## Loop

Observe timer owners, choose one cleanup seam with an unbalanced side effect, write a failing unit or surface test, apply the smallest fix, verify the focused and full suites, then stop unless another concrete seam remains.

## Run: Countdown Sleep Blocker Cleanup

The inventory covered scheduler browser timers, alert timers, title countdown timers, in-meeting timers, poll/force-poll timers, Swift watcher timers, renderer alert/settings timers, and the auto-updater timer.

The actionable seam was the scheduler title countdown path. `startCountdown()` acquires a display sleep blocker for each active pre-meeting countdown. Normal start-time cleanup and `cancelTitleCountdown()` already released it, but `clearAllDisplayTimers()` cleared countdown intervals during poll error recovery without releasing the blocker.

The fix releases one sleep blocker per cleared countdown interval. It intentionally does not release for `clearTimers`, `inMeetingIntervals`, or `inMeetingEndTimers` because those timers do not acquire display sleep blockers.

## Dismissed Timer Surfaces

- Browser-open timers and alert timers already have direct cancel paths that clear timeout handles and do not own display sleep blockers.
- Poll and force-poll timers are scheduler cadence timers; their cleanup is handled by facade stop/restart paths and they do not acquire display sleep blockers.
- Swift watcher debounce, restart, kill, and stable timers are sidecar process-control timers, separate from scheduler display sleep ownership.
- Renderer alert/settings timers are UI-local dismissal or save-indicator timers with no main-process power callbacks.
- Auto-updater timer is a one-off deferred check and has no scheduler display state or power ownership.

## Verification

- Red tests failed before the fix because `allowSleep` was expected once and called zero times.
- Focused countdown and poll suites passed after the fix.
- Typecheck, build, full test suite, and diff whitespace checks passed.
- The fix was committed as `9da2d05 Release countdown sleep blocker on cleanup`.
