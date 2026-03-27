/** Meeting event data model */
export interface MeetingEvent {
  id: string;
  title: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  meetUrl?: string; // meet.google.com/xxx-xxxx-xxx (absent for non-Meet events)
  calendarName: string;
  isAllDay: boolean;
  userEmail?: string; // Current user's Google email from EventKit attendee list
  description?: string; // Event description/notes from macOS Calendar
}

/** Structured result from calendar fetch — either events or an error message */
export type CalendarResult = { events: MeetingEvent[] } | { error: string };

/** Calendar permission states */
export type CalendarPermission = "granted" | "denied" | "not-determined";
