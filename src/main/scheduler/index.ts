import { getSettings } from "../facades/settings.js";
import { scheduleAlertTimer, cancelAlertTimer } from "./alert-timer.js";
import { scheduleBrowserTimer, cancelBrowserTimer } from "./browser-timer.js";
import {
  scheduleTitleCountdown,
  cancelTitleCountdown,
  pruneCancelledEvents,
} from "./title-countdown.js";

import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import type { EventId } from "../../domain/entities/brand.js";
import type { AppSettings } from "../../domain/entities/settings.js";

import {
  state,
  markTitleDirty,
  markInMeetingDirty,
  cancelStaleEntries,
  clearInMeetingState,
  type SchedulerState,
} from "./state/index.js";

import { resolveActiveInMeetingEvent, startInMeetingCountdown } from "./countdown.js";
import {
  getLateJoinGraceMs,
  isLateJoinEligible,
  setLateJoinGraceFromSettings,
} from "./late-join.js";
import { isInQuietHours } from "../../domain/entities/settings.js";

export { getLateJoinGraceMs, isLateJoinEligible, _setLateJoinGraceMsForTest } from "./late-join.js";

/** Get milliseconds before meeting start to open browser, based on settings */
function getOpenBeforeMs(settings: AppSettings): number {
  return settings.openBeforeMinutes * 60 * 1000;
}

/** Don't schedule events that start more than this far in the future */
const MAX_SCHEDULE_AHEAD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Handle an event whose start time is in the past.
 * If the meeting is still in progress, starts the in-meeting countdown
 * and optionally arms a late-join browser open.
 * Returns true if the event was handled (caller should `continue`).
 */
function handleInProgressEvent(
  event: MeetingEvent,
  startMs: number,
  endMs: number,
  now: number,
  activeIds: Set<EventId>,
  s: SchedulerState,
  shouldAbort: () => boolean,
): boolean {
  if (shouldAbort()) return false;
  if (startMs > now) return false;

  // Meeting already ended
  if (endMs <= now) return true;

  const graceMs = getLateJoinGraceMs();
  const settings = getSettings();
  const lateJoin =
    settings.autoOpenEnabled && isLateJoinEligible(event, startMs, endMs, now, graceMs, s);
  const hasPendingBrowserOpen = s.timers.has(event.id);
  // Preserve a pending delay-0 late-join timer across re-polls (title cancel
  // must not kill the browser timer — cancelledEvents is title-only).
  const preserveBrowserTimer =
    lateJoin ||
    (hasPendingBrowserOpen &&
      !s.firedEvents.has(event.id) &&
      graceMs > 0 &&
      startMs <= now &&
      now < startMs + graceMs &&
      !!event.meetUrl &&
      !event.isAllDay);

  if (!preserveBrowserTimer) {
    cancelBrowserTimer(event.id, s.timers);
  }
  cancelAlertTimer(event.id, s.alertTimers);
  cancelTitleCountdown(event.id, s.titleTimers, s.countdownIntervals, s.clearTimers);

  if (lateJoin && !s.timers.has(event.id)) {
    const quiet =
      settings.quietHoursEnabled &&
      isInQuietHours(new Date(now), settings.quietHoursStart, settings.quietHoursEnd);
    scheduleBrowserTimer(
      event,
      0,
      startMs,
      startMs,
      endMs,
      s.timers,
      s.firedEvents,
      s.scheduledEventData,
      {
        nativeNotifications: settings.nativeNotifications && !quiet,
      },
    );
  }

  // Meeting in progress — start in-meeting countdown
  activeIds.add(event.id);

  // Only clear fired flags if event hasn't fired yet — preserve if already fired
  if (!s.firedEvents.has(event.id)) {
    s.alertFiredEvents.delete(event.id);
  }

  if (!s.inMeetingIntervals.has(event.id)) {
    s.scheduledEventData.set(event.id, {
      title: event.title,
      meetUrl: event.meetUrl,
      openAtMs: startMs,
      startMs,
      endMs,
    });
    startInMeetingCountdown(event.id, { title: event.title, endMs });
  }

  return true;
}

/**
 * Check if a future event was already fired or scheduled, and apply change detection.
 * Returns true if the event should be skipped (already handled, no changes).
 * On detected changes, cancels stale timers so the caller can reschedule.
 */
function shouldSkipScheduledEvent(
  event: MeetingEvent,
  startMs: number,
  endMs: number,
  openAtMs: number,
  s: SchedulerState,
): boolean {
  // Already fired — check if start time changed
  if (s.firedEvents.has(event.id)) {
    const prevData = s.scheduledEventData.get(event.id);
    if (prevData && prevData.startMs !== startMs) {
      // Start time changed after browser already opened — allow reschedule
      s.firedEvents.delete(event.id);
      s.alertFiredEvents.delete(event.id);
    } else {
      return true; // already fired, no change
    }
  }

  // Not yet scheduled and no prior snapshot — nothing to compare.
  // (In-progress events have a snapshot but no entry in s.timers, so we must
  // check scheduledEventData independently to catch reschedules from in-progress.)
  const prevData = s.scheduledEventData.get(event.id);
  if (!prevData) return false;

  const timeChanged = prevData.startMs !== startMs;
  const titleChanged = prevData.title !== event.title;
  const urlChanged = prevData.meetUrl !== event.meetUrl;
  const openAtChanged = prevData.openAtMs !== openAtMs;

  if (!timeChanged && !titleChanged && !urlChanged && !openAtChanged) return true; // nothing changed

  if (!timeChanged) {
    // Only metadata changed — update snapshot in-place
    s.scheduledEventData.set(event.id, {
      title: event.title,
      meetUrl: event.meetUrl,
      openAtMs,
      startMs,
      endMs,
    });

    if (urlChanged || openAtChanged) {
      cancelBrowserTimer(event.id, s.timers);
      cancelAlertTimer(event.id, s.alertTimers);
      const reason = openAtChanged ? "Browser open time changed" : "URL changed";
      console.log(`[scheduler] ${reason} for "${event.title}" — rescheduling browser open`);
      // fall through — caller will schedule new timers
      return false;
    }

    // Title-only change — update tray immediately if this event owns the title
    if (state.activeTitleEventId === event.id) {
      const remaining = Math.ceil((startMs - Date.now()) / 60_000);
      if (remaining > 0) state.onTrayTitleUpdate?.(event.title, remaining);
    }
    console.log(`[scheduler] Title updated for "${event.title}"`);
    return true; // no timer changes needed
  }

  // Start time changed — cancel all timers and fully reschedule
  cancelBrowserTimer(event.id, s.timers);
  cancelAlertTimer(event.id, s.alertTimers);
  cancelTitleCountdown(event.id, s.titleTimers, s.countdownIntervals, s.clearTimers);
  // If the event was in-progress under the old start, clear stale in-meeting state
  // so its interval/end timer cannot keep ticking or delete the new snapshot.
  clearInMeetingState(s, event.id);
  s.scheduledEventData.delete(event.id);
  s.firedEvents.delete(event.id); // allow re-fire at new time
  s.alertFiredEvents.delete(event.id); // allow re-alert at new time
  console.log(`[scheduler] Rescheduled "${event.title}" — start time changed`);
  return false; // fall through to schedule new timer
}

/** Schedule all timers (alert, browser, title countdown) for a future event. */
function scheduleFutureTimers(
  event: MeetingEvent,
  delayMs: number,
  openAtMs: number,
  startMs: number,
  endMs: number,
  now: number,
  s: SchedulerState,
  settings: AppSettings,
  shouldAbort: () => boolean,
): void {
  const effectiveDelay = Math.max(0, delayMs);
  const quiet =
    settings.quietHoursEnabled &&
    isInQuietHours(new Date(now), settings.quietHoursStart, settings.quietHoursEnd);

  // Alert timer (offset from browser open by alertLeadSeconds)
  if (settings.windowAlert && !quiet && !s.alertFiredEvents.has(event.id)) {
    scheduleAlertTimer(
      event,
      effectiveDelay,
      endMs,
      s.alertTimers,
      s.alertFiredEvents,
      shouldAbort,
      settings.alertLeadSeconds * 1000,
      openAtMs,
    );
  }

  if (settings.autoOpenEnabled) {
    scheduleBrowserTimer(
      event,
      effectiveDelay,
      openAtMs,
      startMs,
      endMs,
      s.timers,
      s.firedEvents,
      s.scheduledEventData,
      {
        nativeNotifications: settings.nativeNotifications && !quiet,
      },
    );
  }

  // 30-min tray title countdown
  scheduleTitleCountdown(
    { eventId: event.id, eventTitle: event.title, startMs, endMs, now },
    s.titleTimers,
    s.countdownIntervals,
    s.clearTimers,
  );
}

/**
 * Schedule or re-schedule browser-open timers for the given events.
 * Safe to call multiple times — clears stale timers for removed events.
 */
export function scheduleEvents(events: MeetingEvent[]): void {
  const now = Date.now();
  const settings = getSettings();
  setLateJoinGraceFromSettings(settings.lateJoinGraceMinutes);
  const activeIds = new Set<EventId>();

  // Capture pollEpoch so timer callbacks scheduled here can detect a
  // resetState() (which bumps the epoch) and abort instead of mutating
  // a freshly-swapped state object.
  const capturedEpoch = state.pollEpoch;
  const shouldAbort = (): boolean => state.pollEpoch !== capturedEpoch;

  // Snapshot the previously-active event ids so we can detect whether
  // this scheduling pass actually changed the set (and thus whether the
  // title / in-meeting resolvers need to re-run).
  const previousActiveIds = new Set<EventId>([
    ...state.timers.keys(),
    ...state.titleTimers.keys(),
    ...state.countdownIntervals.keys(),
    ...state.inMeetingIntervals.keys(),
  ]);

  for (const event of events) {
    if (event.isAllDay) continue;

    const startMs = new Date(event.startDate).getTime();
    const endMs = new Date(event.endDate).getTime();
    const openAtMs = startMs - getOpenBeforeMs(settings);
    const delayMs = openAtMs - now;

    if (handleInProgressEvent(event, startMs, endMs, now, activeIds, state, shouldAbort)) continue;
    if (delayMs > MAX_SCHEDULE_AHEAD_MS) continue;

    activeIds.add(event.id);

    if (shouldSkipScheduledEvent(event, startMs, endMs, openAtMs, state)) continue;

    scheduleFutureTimers(
      event,
      delayMs,
      openAtMs,
      startMs,
      endMs,
      now,
      state,
      settings,
      shouldAbort,
    );
  }

  // Only mark dirty when the active id set actually changed — avoids
  // unnecessary title / in-meeting recalculation on no-op polls.
  const activeSetChanged =
    previousActiveIds.size !== activeIds.size ||
    [...activeIds].some((id) => !previousActiveIds.has(id));
  if (activeSetChanged) {
    markTitleDirty();
    markInMeetingDirty();
  }

  // Hoisted callback so the cancel path uses a single named function —
  // keeps sleep management symmetric with cancelStaleEntries' contract.
  const onCountdownIntervalCancel = (): void => {
    state.powerCallbacks?.allowSleep?.();
  };

  // Cancel timers for events that are no longer in the list (e.g. cancelled meetings)
  cancelStaleEntries(state, activeIds, {
    onBrowserCancel: cancelBrowserTimer,
    onAlertCancel: cancelAlertTimer,
    onCountdownIntervalCancel,
    onPruneCancelledEvents: pruneCancelledEvents,
  });

  // After cleanup, re-resolve tray title ownership
  // (handles the case where the active countdown event was just removed)
  resolveActiveInMeetingEvent();
}
