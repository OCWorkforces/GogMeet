import type { CalendarResult } from "../../../domain/entities/calendar-result.js";

/** Cap to prevent unbounded growth after error handler has already fired */
export const MAX_CONSECUTIVE_ERRORS_CAP = 4;

export interface PollState {
  consecutiveErrors: number;
  pollTimeout: ReturnType<typeof setTimeout> | null;
  pollEpoch: number;
  lastKnownEvents: CalendarResult | null;
}

export function createPollState(): PollState {
  return {
    consecutiveErrors: 0,
    pollTimeout: null,
    pollEpoch: 0,
    lastKnownEvents: null,
  };
}
