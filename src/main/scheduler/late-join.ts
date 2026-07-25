import type { MeetingEvent } from "../../shared/meeting-event.js";
import type { EventId } from "../../shared/brand.js";

/** Minimal state surface for late-join eligibility (avoids coupling to full SchedulerState). */
export interface LateJoinStateView {
  readonly firedEvents: ReadonlyMap<EventId, number>;
}

/**
 * Late-join grace after meeting start (ms). Default 0 = off.
 * Overridable in tests; settings wiring lands with schema v2.
 */
let lateJoinGraceMsOverride: number | null = null;

/** Test-only: inject late-join grace. Pass null to restore default (0). */
export function _setLateJoinGraceMsForTest(ms: number | null): void {
  lateJoinGraceMsOverride = ms;
}

export function getLateJoinGraceMs(): number {
  return lateJoinGraceMsOverride ?? 0;
}

/**
 * Whether an in-progress meeting may still auto-open within the grace window.
 * Uses `firedEvents` only for suppression — never title-countdown `cancelledEvents`.
 */
export function isLateJoinEligible(
  event: MeetingEvent,
  startMs: number,
  endMs: number,
  now: number,
  graceMs: number,
  s: LateJoinStateView,
): boolean {
  if (event.isAllDay || !event.meetUrl) return false;
  if (s.firedEvents.has(event.id)) return false;
  if (endMs <= now) return false;
  if (graceMs <= 0) return false;
  return startMs <= now && now < startMs + graceMs;
}
