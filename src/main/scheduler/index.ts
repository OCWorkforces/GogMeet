import { getSettings } from "../facades/settings.js";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import type { EventId } from "../../domain/entities/brand.js";
import { state } from "./state/index.js";
import { getLateJoinGraceMs, setLateJoinGraceFromSettings } from "./late-join.js";
import { planSchedule } from "./core/plan-schedule.js";
import type { ScheduleSnapshot } from "./core/schedule-types.js";
import { interpretSchedulePlan } from "./adapters/interpret-schedule.js";

export { getLateJoinGraceMs, isLateJoinEligible, _setLateJoinGraceMsForTest } from "./late-join.js";
export { planSchedule, getOpenBeforeMs, MAX_SCHEDULE_AHEAD_MS } from "./core/plan-schedule.js";
export type { ScheduleAction, SchedulePlan, ScheduleSnapshot } from "./core/schedule-types.js";

function buildScheduleSnapshot(): ScheduleSnapshot {
  return {
    firedEvents: state.firedEvents,
    alertFiredEvents: state.alertFiredEvents,
    pendingBrowserIds: new Set(state.timers.keys()),
    scheduledEventData: state.scheduledEventData,
    inMeetingIds: new Set(state.inMeetingIntervals.keys()),
    activeTitleEventId: state.activeTitleEventId,
    previousActiveIds: new Set<EventId>([
      ...state.timers.keys(),
      ...state.titleTimers.keys(),
      ...state.countdownIntervals.keys(),
      ...state.inMeetingIntervals.keys(),
    ]),
  };
}

/**
 * Schedule or re-schedule browser-open timers for the given events.
 * Safe to call multiple times — clears stale timers for removed events.
 *
 * Pure decisions live in {@link planSchedule}; side effects in interpret.
 */
export function scheduleEvents(events: MeetingEvent[]): void {
  const now = Date.now();
  const settings = getSettings();

  // Keep settings-backed grace in sync (does not clobber test override).
  setLateJoinGraceFromSettings(settings.lateJoinGraceMinutes);

  const capturedEpoch = state.pollEpoch;
  const shouldAbort = (): boolean => state.pollEpoch !== capturedEpoch;

  const plan = planSchedule(events, settings, now, buildScheduleSnapshot(), {
    lateJoinGraceMs: getLateJoinGraceMs(),
  });

  interpretSchedulePlan(plan, { shouldAbort });
}
