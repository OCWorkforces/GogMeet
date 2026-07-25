import type { EventId } from "../../shared/brand.js";
import type { CalendarResult } from "../../shared/calendar-result.js";
import { isCalendarOk } from "../../shared/calendar-result.js";
import type { MeetingEvent } from "../../shared/meeting-event.js";
import type { Result } from "../../shared/result.js";
import { err, ok } from "../../shared/result.js";
import { getCalendarEventsResult } from "../domain/calendar.js";
import { cancelPendingBrowserOpen, getLastKnownEvents } from "../scheduler/facade.js";
import { buildMeetUrl, openMeetingUrl } from "./meet-url.js";

function calendarErrMessage(c: CalendarResult | null): string {
  if (c === null) return "No calendar data available";
  if (!isCalendarOk(c)) return c.error;
  return "Unknown calendar error";
}

function findEvent(c: CalendarResult, id: EventId): MeetingEvent | undefined {
  return isCalendarOk(c) ? c.events.find((e) => e.id === id) : undefined;
}

/**
 * Resolve a meeting by EventId, open it with identity params, and suppress
 * pending auto-open for that event. All menu / hotkey / IPC join paths use this.
 */
export async function joinMeetingById(id: EventId): Promise<Result<void, string>> {
  let calendar: CalendarResult | null = getLastKnownEvents();
  let event = calendar !== null ? findEvent(calendar, id) : undefined;

  // Fallback once: null/err cache, missing id, or empty meetUrl
  const needsFetch =
    calendar === null || !isCalendarOk(calendar) || event === undefined || !event.meetUrl;

  if (needsFetch) {
    calendar = await getCalendarEventsResult();
    event = isCalendarOk(calendar) ? findEvent(calendar, id) : undefined;
  }

  if (calendar === null) return err(calendarErrMessage(null));
  if (!isCalendarOk(calendar)) return err(calendar.error);
  if (!event) return err("Meeting not found");

  const url = buildMeetUrl(event);
  if (!url) return err("No joinable meeting URL");

  const opened = await openMeetingUrl(url);
  if (!opened.ok) return opened;

  // Suppress pending auto-open / mark fired so we never double-open
  cancelPendingBrowserOpen(id);
  return ok(undefined);
}
