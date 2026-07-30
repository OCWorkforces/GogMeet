import type { CalendarResult } from "./calendar-result.js";

/**
 * Main-process publication envelope for coordinated calendar refreshes.
 * Carried on IPC GET_EVENTS and RESULT_UPDATED push.
 */
export interface CalendarPublication {
  readonly publicationGeneration: number;
  readonly result: CalendarResult;
}
