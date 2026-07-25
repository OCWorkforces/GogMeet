import type { MeetingEvent } from "./meeting-event.js";

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

/** Stable error codes for calendar fetch failures (maps from Swift exit / AppError). */
export type CalendarErrorCode =
  | "permission-denied"
  | "no-calendars"
  | "runtime"
  | "unknown";

/** Failed calendar fetch — error message and structured code for UI branching */
export interface CalendarResultErr {
  kind: "err";
  error: string;
  /** Required structured code so UI can distinguish permission vs runtime failures. */
  code: CalendarErrorCode;
}

/** Structured result from calendar fetch — discriminated union on `kind` */
export type CalendarResult = CalendarResultOk | CalendarResultErr;

/** Type guard: narrows CalendarResult to its ok variant */
export function isCalendarOk(result: CalendarResult): result is CalendarResultOk {
  return result.kind === "ok";
}

/** Calendar permission states */
export type CalendarPermission = "granted" | "denied" | "not-determined";
