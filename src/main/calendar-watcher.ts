import { forcePoll } from "./scheduler/facade.js";
import {
  startWatchSidecar,
  stopWatchSidecar,
} from "./swift/calendar-watch-sidecar.js";


let started = false;

/**
 * Start the Swift `--watch` sidecar that listens for
 * `EKEventStoreChangedNotification` from macOS EventKit. When a change is
 * detected (debounced inside the sidecar), triggers an immediate `forcePoll()`
 * so the popover and tray menu reflect the latest calendar state without
 * waiting for the next scheduled poll (2–4 min).
 *
 * Non-critical — scheduler polling continues even if the sidecar fails.
 * Idempotent: subsequent calls are no-ops until `stopCalendarWatcher()`.
 */
export function startCalendarWatcher(): void {
  if (started) return;
  started = true;
  startWatchSidecar(() => {
    void forcePoll();
  });
  console.log("[calendar-watcher] Sidecar started (EKEventStoreChangedNotification)");
}

/**
 * Stop the Swift watch sidecar. Safe to call multiple times.
 */
export function stopCalendarWatcher(): void {
  if (!started) return;
  started = false;
  stopWatchSidecar();
  console.log("[calendar-watcher] Stopped");
}
