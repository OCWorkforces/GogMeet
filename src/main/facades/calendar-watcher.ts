import { forcePoll } from "../scheduler/facade.js";
import { getCalendarPort } from "./calendar.js";
import type { CalendarPort } from "../application/ports/calendar-port.js";

let started = false;
let watchPort: CalendarPort | null = null;

/**
 * Start calendar change watching for the active provider.
 *
 * On Darwin this starts the EventKit change watch (via provider). On Windows
 * Google/fixture providers omit startWatch (poll-only).
 *
 * Non-critical — scheduler polling continues even if watch fails.
 * Idempotent: subsequent calls are no-ops until `stopCalendarWatcher()`.
 */
export function startCalendarWatcher(): void {
  if (started) return;
  started = true;
  void getCalendarPort()
    .then((port) => {
      if (!started) return;
      watchPort = port;
      if (port.startWatch) {
        port.startWatch(() => {
          void forcePoll({ reason: "watch" });
        });
        console.log("[calendar-watcher] Watch started");
      } else {
        console.log("[calendar-watcher] No watch (poll-only)");
      }
    })
    .catch((err: unknown) => {
      console.warn("[calendar-watcher] Failed to start watch:", err);
    });
}

/**
 * Stop the active provider watch. Safe to call multiple times.
 */
export function stopCalendarWatcher(): void {
  if (!started && watchPort === null) return;
  started = false;
  try {
    watchPort?.stopWatch?.();
  } catch (err) {
    console.warn("[calendar-watcher] stopWatch failed:", err);
  }
  watchPort = null;
  console.log("[calendar-watcher] Stopped");
}

/**
 * Attempt to recover a failed/given-up watch (resume/unlock). No-op if never
 * started or currently stopped intentionally.
 */
export function reviveCalendarWatcher(): void {
  if (!started) return;
  if (watchPort?.reviveWatch) {
    watchPort.reviveWatch();
    return;
  }
  // start still in-flight or provider not yet cached — resolve and revive
  void getCalendarPort()
    .then((port) => {
      watchPort = port;
      port.reviveWatch?.();
    })
    .catch((err: unknown) => {
      console.warn("[calendar-watcher] revive failed:", err);
    });
}
