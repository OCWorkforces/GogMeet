import type { EventId } from "../../../domain/entities/brand.js";
import type { CalendarResult } from "../../../domain/entities/calendar-result.js";
import { isCalendarOk } from "../../../domain/entities/calendar-result.js";
import type { MeetingEvent } from "../../../domain/entities/meeting-event.js";
import type { Result } from "../../../domain/entities/result.js";
import { err, ok } from "../../../domain/entities/result.js";
import { buildMeetUrl } from "../../../domain/services/build-meet-url.js";
import type { MeetingOpenerPort } from "../ports/meeting-opener-port.js";

export interface JoinMeetingDeps {
  /** Last successful/err poll cache from scheduler. */
  getLastKnownEvents(): CalendarResult | null;
  /** Live fetch when cache misses. */
  fetchCalendarEvents(): Promise<CalendarResult>;
  opener: MeetingOpenerPort;
  cancelPendingBrowserOpen(id: EventId): void;
}

export interface JoinMeeting {
  execute(id: EventId): Promise<Result<void, string>>;
}

function calendarErrMessage(c: CalendarResult | null): string {
  if (c === null) return "No calendar data available";
  if (!isCalendarOk(c)) return c.error;
  return "Unknown calendar error";
}

function findEvent(c: CalendarResult, id: EventId): MeetingEvent | undefined {
  return isCalendarOk(c) ? c.events.find((e) => e.id === id) : undefined;
}

/**
 * Resolve a meeting by EventId, open with identity params, suppress auto-open.
 * Sole algorithm body for all join paths.
 */
export function createJoinMeeting(deps: JoinMeetingDeps): JoinMeeting {
  return {
    async execute(id: EventId): Promise<Result<void, string>> {
      let calendar: CalendarResult | null = deps.getLastKnownEvents();
      let event = calendar !== null ? findEvent(calendar, id) : undefined;

      const needsFetch =
        calendar === null || !isCalendarOk(calendar) || event === undefined || !event.meetUrl;

      if (needsFetch) {
        calendar = await deps.fetchCalendarEvents();
        event = isCalendarOk(calendar) ? findEvent(calendar, id) : undefined;
      }

      if (calendar === null) return err(calendarErrMessage(null));
      if (!isCalendarOk(calendar)) return err(calendar.error);
      if (!event) return err("Meeting not found");

      const url = buildMeetUrl(event);
      if (!url) return err("No joinable meeting URL");

      const opened = await deps.opener.open(url);
      if (!opened.ok) return opened;

      deps.cancelPendingBrowserOpen(id);
      return ok(undefined);
    },
  };
}
