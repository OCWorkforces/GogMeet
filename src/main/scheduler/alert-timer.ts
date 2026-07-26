import type { MeetingEvent } from "../../shared/meeting-event.js";
import type { EventId, IsoUtc } from "../../shared/brand.js";
import { asIsoUtc } from "../../shared/brand.js";
import { FIRED_EVENT_TTL_MS } from "./state/state-timers.js";
import { showAlert } from "../windows/alert-window.js";

/** Default alert lead before browser open (overridden by settings). */
const DEFAULT_ALERT_OFFSET_MS = 60 * 1000;

export const ALERT_OFFSET_MS: number = DEFAULT_ALERT_OFFSET_MS;

/**
 * Schedule an alert timer for a meeting event.
 * Fires `alertLeadMs` before the browser open to show a full-screen overlay.
 */
export function scheduleAlertTimer(
  event: MeetingEvent,
  effectiveDelay: number,
  endMs: number,
  alertTimers: Map<EventId, ReturnType<typeof setTimeout>>,
  alertFiredEvents: Map<EventId, number>,
  shouldAbort?: () => boolean,
  alertLeadMs: number = DEFAULT_ALERT_OFFSET_MS,
  openAtMs?: number,
): void {
  cancelAlertTimer(event.id, alertTimers);

  const alertDelayMs = Math.max(0, effectiveDelay - alertLeadMs);
  const autoOpenAt: IsoUtc | undefined = (() => {
    if (openAtMs === undefined) return undefined;
    const branded = asIsoUtc(new Date(openAtMs).toISOString());
    return branded.ok ? branded.value : undefined;
  })();

  const alertHandle = setTimeout(() => {
    if (shouldAbort?.()) return;
    alertTimers.delete(event.id);
    alertFiredEvents.set(event.id, endMs + FIRED_EVENT_TTL_MS);
    try {
      showAlert(event, autoOpenAt);
    } catch {
      // Non-critical — alert is optional UX
    }
    console.log(
      `[scheduler] Alert shown for "${event.title}" (${Math.round(alertDelayMs / 1000)}s before open)`,
    );
  }, alertDelayMs);
  alertTimers.set(event.id, alertHandle);
}

/**
 * Cancel an alert timer for a specific event.
 */
export function cancelAlertTimer(
  eventId: EventId,
  alertTimers: Map<EventId, ReturnType<typeof setTimeout>>,
): void {
  const handle = alertTimers.get(eventId);
  if (handle) {
    clearTimeout(handle);
    alertTimers.delete(eventId);
  }
}
