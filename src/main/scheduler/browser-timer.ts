import { Notification } from "electron";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import type { EventId } from "../../domain/entities/brand.js";
import { FIRED_EVENT_TTL_MS } from "./state/state-timers.js";
import type { ScheduledEventSnapshot } from "./state/index.js";
import { buildMeetUrl } from "../../domain/services/build-meet-url.js";
import { openMeetingUrl } from "../utils/meet-url.js";
import { getLateJoinGraceMs } from "./late-join.js";

/** Human-readable notification body based on minutes until meeting start. */
export function notificationBodyForOpen(startMs: number, nowMs: number = Date.now()): string {
  const mins = Math.max(0, Math.round((startMs - nowMs) / 60_000));
  if (mins <= 0) return "Starting now";
  if (mins === 1) return "Starting in 1 min";
  return `Starting in ${mins} min`;
}

export interface BrowserTimerOptions {
  nativeNotifications?: boolean;
}

/**
 * Schedule a browser-open timer for a meeting event.
 * Shows a notification and opens the meeting URL when the timer fires.
 */
export function scheduleBrowserTimer(
  event: MeetingEvent,
  effectiveDelay: number,
  openAtMs: number,
  startMs: number,
  endMs: number,
  timers: Map<EventId, ReturnType<typeof setTimeout>>,
  firedEvents: Map<EventId, number>,
  scheduledEventData: Map<EventId, ScheduledEventSnapshot>,
  options: BrowserTimerOptions = {},
): void {
  const showNativeNotification = options.nativeNotifications !== false;
  const handle = setTimeout(() => {
    if (timers.get(event.id) !== handle) return;
    timers.delete(event.id);
    const now = Date.now();
    const graceMs = getLateJoinGraceMs();
    // Past grace window after start: mark fired, do not open
    if (now >= startMs + graceMs) {
      firedEvents.set(event.id, endMs + FIRED_EVENT_TTL_MS);
      return;
    }
    firedEvents.set(event.id, endMs + FIRED_EVENT_TTL_MS);
    if (showNativeNotification) {
      try {
        new Notification({
          title: event.title,
          body: notificationBodyForOpen(startMs, now),
        }).show();
      } catch {
        console.warn(`[scheduler] Notification denied for "${event.title}"`);
      }
    }
    // Open browser for meetings with a URL (suppressed when alert is dismissed via cancelPendingBrowserOpen)
    if (!event.meetUrl) {
      console.log(`[scheduler] Notification shown for "${event.title}" (no URL)`);
      return;
    }
    const url = buildMeetUrl(event);
    void openMeetingUrl(url).then((result) => {
      if (result?.ok) {
        console.log(`[scheduler] Opened browser for "${event.title}" → ${url}`);
      } else {
        console.error(
          `[scheduler] Failed to open browser for "${event.title}":`,
          result && !result.ok ? result.error : "unknown",
        );
      }
    });
  }, effectiveDelay);

  timers.set(event.id, handle);
  scheduledEventData.set(event.id, {
    title: event.title,
    meetUrl: event.meetUrl,
    openAtMs,
    startMs,
    endMs,
  });
  console.log(
    `[scheduler] Scheduled "${event.title}" to open in ${Math.round(effectiveDelay / 1000)}s`,
  );
}

/**
 * Cancel a browser timer for a specific event.
 */
export function cancelBrowserTimer(
  eventId: EventId,
  timers: Map<EventId, ReturnType<typeof setTimeout>>,
): void {
  const handle = timers.get(eventId);
  if (handle) {
    clearTimeout(handle);
    timers.delete(eventId);
  }
}
