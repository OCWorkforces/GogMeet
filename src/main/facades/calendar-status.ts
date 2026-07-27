import type { CalendarErrorCode } from "../../shared/calendar-result.js";
import type { CalendarResult } from "../../shared/calendar-result.js";
import { isCalendarOk } from "../../shared/calendar-result.js";

export type CalendarStatus =
  | { kind: "ok"; updatedAt: number }
  | { kind: "err"; error: string; code: CalendarErrorCode; updatedAt: number }
  | { kind: "unknown" };

let lastStatus: CalendarStatus = { kind: "unknown" };

export function recordCalendarResult(result: CalendarResult): void {
  const updatedAt = Date.now();
  if (isCalendarOk(result)) {
    lastStatus = { kind: "ok", updatedAt };
    return;
  }
  lastStatus = {
    kind: "err",
    error: result.error,
    code: result.code,
    updatedAt,
  };
}

export function getLastCalendarStatus(): CalendarStatus {
  return lastStatus;
}

/** Test-only reset */
export function _resetCalendarStatusForTest(): void {
  lastStatus = { kind: "unknown" };
}
