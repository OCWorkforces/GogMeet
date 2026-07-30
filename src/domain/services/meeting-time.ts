/**
 * Wall-clock predicates for meeting display and join selection.
 *
 * Inequality contract (locked by tests):
 * - In progress: startMs <= nowMs < endMs
 * - Not ended / upcoming: endMs > nowMs
 * - Ended: endMs <= nowMs
 *
 * All-day policy is left to callers via {@link FilterUpcomingOptions.excludeAllDay}.
 */

import type { MeetingEvent } from "../entities/meeting-event.js";

export interface FilterUpcomingOptions {
  /** When true, drop all-day events (tray menu / scheduler join surfaces). */
  readonly excludeAllDay?: boolean;
}

function eventBoundsMs(event: MeetingEvent): { startMs: number; endMs: number } | null {
  const startMs = new Date(event.startDate).getTime();
  const endMs = new Date(event.endDate).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { startMs, endMs };
}

/** True while a timed meeting is underway (`start <= now < end`). */
export function isMeetingInProgress(event: MeetingEvent, nowMs: number): boolean {
  const bounds = eventBoundsMs(event);
  if (!bounds) return false;
  return bounds.startMs <= nowMs && nowMs < bounds.endMs;
}

/** True while the meeting has not ended (`end > now`). */
export function isMeetingNotEnded(event: MeetingEvent, nowMs: number): boolean {
  const bounds = eventBoundsMs(event);
  if (!bounds) return false;
  return bounds.endMs > nowMs;
}

/**
 * Filter events eligible for upcoming display lists.
 * Drops ended and invalid-date events; optionally drops all-day.
 */
export function filterUpcomingMeetings(
  events: readonly MeetingEvent[],
  nowMs: number,
  opts?: FilterUpcomingOptions,
): MeetingEvent[] {
  const excludeAllDay = opts?.excludeAllDay === true;
  const result: MeetingEvent[] = [];
  for (const event of events) {
    if (excludeAllDay && event.isAllDay) continue;
    if (!isMeetingNotEnded(event, nowMs)) continue;
    result.push(event);
  }
  return result;
}

/**
 * Next wall-clock ms when display membership or coarse relative labels may change.
 * Considers start/end of non-ended events and the next minute boundary when any
 * future event is within 15 minutes of start (popover "In N min" labels).
 *
 * Returns null when no future boundary exists.
 */
export function nextDisplayHorizonMs(
  events: readonly MeetingEvent[],
  nowMs: number,
): number | null {
  let soonest: number | null = null;

  const consider = (ms: number): void => {
    if (!Number.isFinite(ms) || ms <= nowMs) return;
    if (soonest === null || ms < soonest) soonest = ms;
  };

  for (const event of events) {
    const bounds = eventBoundsMs(event);
    if (!bounds) continue;
    const { startMs, endMs } = bounds;
    if (endMs <= nowMs) continue;

    // Label transitions: future → starting/in-progress at start; leave list at end.
    if (startMs > nowMs) {
      consider(startMs);
      // Soft "In N min" labels refresh each minute while within 15 min of start.
      const minsUntilStart = (startMs - nowMs) / 60_000;
      if (minsUntilStart <= 15) {
        const nextMinute = nowMs + (60_000 - (nowMs % 60_000));
        if (nextMinute < startMs) consider(nextMinute);
      }
    }
    consider(endMs);
  }

  return soonest;
}
