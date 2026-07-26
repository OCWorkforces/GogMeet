import { forcePoll } from "../scheduler/facade.js";
import { getActiveCalendarProvider } from "../calendar/factory.js";
import type { CalendarProvider } from "../calendar/provider.js";

let started = false;
let watchProvider: CalendarProvider | null = null;

/**
 * Start calendar change watching for the active provider.
 *
 * On Darwin this starts the Swift `--watch` sidecar (EventKit change
 * notifications → debounced `forcePoll()`). On Windows the stub/Google
 * providers omit `startWatch` (poll-only).
 *
 * Non-critical — scheduler polling continues even if watch fails.
 * Idempotent: subsequent calls are no-ops until `stopCalendarWatcher()`.
 */
export function startCalendarWatcher(): void {
  if (started) return;
  started = true;
  void getActiveCalendarProvider()
    .then((provider) => {
      if (!started) return;
      watchProvider = provider;
      if (provider.startWatch) {
        provider.startWatch(() => {
          void forcePoll();
        });
        console.log(`[calendar-watcher] Watch started (provider=${provider.id})`);
      } else {
        console.log(`[calendar-watcher] No watch for provider=${provider.id} (poll-only)`);
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
  if (!started && watchProvider === null) return;
  started = false;
  try {
    watchProvider?.stopWatch?.();
  } catch (err) {
    console.warn("[calendar-watcher] stopWatch failed:", err);
  }
  watchProvider = null;
  console.log("[calendar-watcher] Stopped");
}
