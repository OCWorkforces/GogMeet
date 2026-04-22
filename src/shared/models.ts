import type { EventId, IsoUtc, MeetUrl } from "./brand.js";

/** Meeting event data model */
export interface MeetingEvent {
  id: EventId;
  title: string;
  startDate: IsoUtc; // ISO 8601 (UTC)
  endDate: IsoUtc; // ISO 8601 (UTC)
  meetUrl?: MeetUrl; // meet.google.com/xxx-xxxx-xxx (absent for non-Meet events)
  calendarName: string;
  isAllDay: boolean;
  userEmail?: string; // Current user's Google email from EventKit attendee list
  description?: string; // Event description/notes from macOS Calendar
}

/** Successful calendar fetch — events available */
export interface CalendarResultOk {
  kind: "ok";
  events: MeetingEvent[];
}

/** Failed calendar fetch — error message available */
export interface CalendarResultErr {
  kind: "err";
  error: string;
}

/** Structured result from calendar fetch — discriminated union on `kind` */
export type CalendarResult = CalendarResultOk | CalendarResultErr;

/** Type guard: narrows CalendarResult to its ok variant */
export function isCalendarOk(result: CalendarResult): result is CalendarResultOk {
  return result.kind === "ok";
}

/** Calendar permission states */
export type CalendarPermission = "granted" | "denied" | "not-determined";
