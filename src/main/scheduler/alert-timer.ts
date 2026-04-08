import type { MeetingEvent } from "../../shared/models.js";
import { showAlert } from "../alert-window.js";

const ALERT_OFFSET_MS = 60 * 1000;

export { ALERT_OFFSET_MS };

/**
 * Schedule an alert timer for a meeting event.
 * Fires 1 minute before the browser open to show a full-screen overlay.
 */
export function scheduleAlertTimer(
  event: MeetingEvent,
  effectiveDelay: number,
  alertTimers: Map<string, ReturnType<typeof setTimeout>>,
  alertFiredEvents: Set<string>,
): void {
  // Cancel any existing alert timer for this event
  cancelAlertTimer(event.id, alertTimers);

  const alertDelayMs = Math.max(0, effectiveDelay - ALERT_OFFSET_MS);
  const alertHandle = setTimeout(() => {
    alertTimers.delete(event.id);
    alertFiredEvents.add(event.id);
    try {
      showAlert(event);
    } catch {
      // Non-critical — alert is optional UX
    }
    console.log(
      `[scheduler] Alert shown for "${event.title}" (${Math.round(alertDelayMs / 1000)}s before meeting)`,
    );
  }, alertDelayMs);
  alertTimers.set(event.id, alertHandle);
}

/**
 * Cancel an alert timer for a specific event.
 */
export function cancelAlertTimer(
  eventId: string,
  alertTimers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  const handle = alertTimers.get(eventId);
  if (handle) {
    clearTimeout(handle);
    alertTimers.delete(eventId);
  }
}
