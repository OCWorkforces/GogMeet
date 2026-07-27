import type { EventId } from "../../../domain/entities/brand.js";
import { scheduleAlertTimer, cancelAlertTimer } from "../alert-timer.js";
import { scheduleBrowserTimer, cancelBrowserTimer } from "../browser-timer.js";
import {
  scheduleTitleCountdown,
  cancelTitleCountdown,
  pruneCancelledEvents,
} from "../title-countdown.js";
import {
  state,
  markTitleDirty,
  markInMeetingDirty,
  cancelStaleEntries,
  clearInMeetingState,
} from "../state/index.js";
import { resolveActiveInMeetingEvent, startInMeetingCountdown } from "../countdown.js";
import { setLateJoinGraceFromSettings } from "../late-join.js";
import type { ScheduleAction, SchedulePlan } from "../core/schedule-types.js";

export interface InterpretOptions {
  /** When true, timer callbacks no-op (poll epoch / generation abort). */
  shouldAbort: () => boolean;
}

/**
 * Apply a pure SchedulePlan by mutating scheduler state and arming timers.
 */
export function interpretSchedulePlan(plan: SchedulePlan, options: InterpretOptions): void {
  const { shouldAbort } = options;

  for (const action of plan.actions) {
    applyAction(action, shouldAbort);
  }
}

function applyAction(action: ScheduleAction, shouldAbort: () => boolean): void {
  const s = state;

  switch (action.type) {
    case "set-late-join-grace":
      setLateJoinGraceFromSettings(action.graceMs / 60_000);
      break;

    case "arm-browser":
      scheduleBrowserTimer(
        action.event,
        action.delayMs,
        action.openAtMs,
        action.startMs,
        action.endMs,
        s.timers,
        s.firedEvents,
        s.scheduledEventData,
        { nativeNotifications: action.notify },
      );
      break;

    case "arm-alert":
      scheduleAlertTimer(
        action.event,
        action.delayMs,
        action.endMs,
        s.alertTimers,
        s.alertFiredEvents,
        shouldAbort,
        action.alertLeadMs,
        action.openAtMs,
      );
      break;

    case "arm-title":
      scheduleTitleCountdown(
        {
          eventId: action.eventId,
          eventTitle: action.eventTitle,
          startMs: action.startMs,
          endMs: action.endMs,
          now: action.nowMs,
        },
        s.titleTimers,
        s.countdownIntervals,
        s.clearTimers,
      );
      break;

    case "start-in-meeting":
      s.scheduledEventData.set(action.eventId, {
        title: action.title,
        meetUrl: action.meetUrl,
        openAtMs: action.openAtMs,
        startMs: action.startMs,
        endMs: action.endMs,
      });
      startInMeetingCountdown(action.eventId, { title: action.title, endMs: action.endMs });
      break;

    case "cancel-browser":
      cancelBrowserTimer(action.eventId, s.timers);
      break;

    case "cancel-alert":
      cancelAlertTimer(action.eventId, s.alertTimers);
      break;

    case "cancel-title":
      cancelTitleCountdown(action.eventId, s.titleTimers, s.countdownIntervals, s.clearTimers);
      break;

    case "clear-fired":
      s.firedEvents.delete(action.eventId);
      break;

    case "clear-alert-fired":
      s.alertFiredEvents.delete(action.eventId);
      break;

    case "clear-in-meeting":
      clearInMeetingState(s, action.eventId);
      break;

    case "delete-snapshot":
      s.scheduledEventData.delete(action.eventId);
      break;

    case "update-snapshot":
      s.scheduledEventData.set(action.eventId, action.snapshot);
      break;

    case "update-title-only": {
      const remaining = Math.ceil((action.startMs - Date.now()) / 60_000);
      if (remaining > 0) s.onTrayTitleUpdate?.(action.title, remaining);
      break;
    }

    case "mark-title-dirty":
      markTitleDirty();
      break;

    case "mark-in-meeting-dirty":
      markInMeetingDirty();
      break;

    case "prune-absent": {
      const retain = new Set<EventId>(action.retainIds);
      const onCountdownIntervalCancel = (): void => {
        s.powerCallbacks?.allowSleep?.();
      };
      cancelStaleEntries(s, retain, {
        onBrowserCancel: cancelBrowserTimer,
        onAlertCancel: cancelAlertTimer,
        onCountdownIntervalCancel,
        onPruneCancelledEvents: pruneCancelledEvents,
      });
      break;
    }

    case "resolve-active-in-meeting":
      resolveActiveInMeetingEvent();
      break;

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      break;
    }
  }
}
