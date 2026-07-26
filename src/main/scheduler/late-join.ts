import type { MeetingEvent } from "../../shared/meeting-event.js";
import type { EventId } from "../../shared/brand.js";

/** Minimal state surface for late-join eligibility (avoids coupling to full SchedulerState). */
export interface LateJoinStateView {
  readonly firedEvents: ReadonlyMap<EventId, number>;
}

/**
 * Late-join grace after meeting start (ms). Settings-driven; overridable in tests.
 */
let lateJoinGraceMsOverride: number | null = null;

/** Test-only: inject late-join grace. Pass null to restore settings-backed value. */
export function _setLateJoinGraceMsForTest(ms: number | null): void {
  lateJoinGraceMsOverride = ms;
}

export function getLateJoinGraceMs(): number {
  if (lateJoinGraceMsOverride !== null) return lateJoinGraceMsOverride;
  try {
    // Lazy import-free: callers inject via setLateJoinGraceFromSettings to avoid cycles.
    return settingsLateJoinGraceMs;
  } catch {
    return 0;
  }
}

let settingsLateJoinGraceMs = 0;

/** Called by scheduleEvents from getSettings() each poll. */
export function setLateJoinGraceFromSettings(minutes: number): void {
  settingsLateJoinGraceMs = Math.max(0, minutes) * 60_000;
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
