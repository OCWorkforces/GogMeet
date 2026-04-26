import { Notification } from "electron";
import type { MeetingEvent } from "../../shared/models.js";
import type { ScheduledEventSnapshot } from "./state.js";
import { buildMeetUrl, openMeetingUrl } from "../utils/meet-url.js";

/**
 * Schedule a browser-open timer for a meeting event.
 * Shows a notification and opens the meeting URL when the timer fires.
 */
export function scheduleBrowserTimer(
  event: MeetingEvent,
  effectiveDelay: number,
  startMs: number,
  endMs: number,
  timers: Map<string, ReturnType<typeof setTimeout>>,
  firedEvents: Set<string>,
  scheduledEventData: Map<string, ScheduledEventSnapshot>,
  shouldAbort?: () => boolean,
): void {
  const handle = setTimeout(() => {
    if (shouldAbort?.()) return;
    timers.delete(event.id);
    firedEvents.add(event.id);
    // Always show notification for all meetings
    try {
      new Notification({
        title: event.title,
        body: "Starting now",
      }).show();
    } catch {
      console.warn(`[scheduler] Notification denied for "${event.title}"`);
    }
    // Open browser for meetings with a URL (alert dismiss doesn't prevent this)
    if (!event.meetUrl) {
      console.log(
        `[scheduler] Notification shown for "${event.title}" (no URL)`,
      );
      return;
    }
    const url = buildMeetUrl(event);
    void openMeetingUrl(url);
    console.log(`[scheduler] Opened browser for "${event.title}" → ${url}`);
  }, effectiveDelay);

  timers.set(event.id, handle);
  scheduledEventData.set(event.id, {
    title: event.title,
    meetUrl: event.meetUrl,
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
  eventId: string,
  timers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  const handle = timers.get(eventId);
  if (handle) {
    clearTimeout(handle);
    timers.delete(eventId);
  }
}
