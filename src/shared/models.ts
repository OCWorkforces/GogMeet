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

/**
 * CalendarResult — domain-specific result for Swift EventKit fetches.
 *
 * Intentionally diverges from the generic `Result<T,E>` in result.ts:
 *  - Uses `kind: "ok"|"err"` (not `ok: boolean`) with an `isCalendarOk()` guard.
 *  - Models discrete Swift exit codes (permission-denied, no-calendars, error,
 *    timeout) that map to specific tray menu states and user-facing messages.
 *
 * Do not collapse into `Result<MeetingEvent[], CalendarError>`: the shape is
 * a stable contract across the Swift parser, IPC boundary, and renderer. For
 * unrelated fallible operations, use `Result<T,E>` from result.ts instead.
 */
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
