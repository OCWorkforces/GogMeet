import { getSettings } from "../settings.js";
import { scheduleAlertTimer, cancelAlertTimer } from "./alert-timer.js";
import { scheduleBrowserTimer, cancelBrowserTimer } from "./browser-timer.js";
import { scheduleTitleCountdown, cancelTitleCountdown } from "./title-countdown.js";

import type { BrowserWindow } from "electron";
import type { MeetingEvent } from "../../shared/models.js";

import {
  state,
  markTitleDirty,
  markInMeetingDirty,
  cancelStaleEntries,
} from "./state.js";

import {
  resolveActiveInMeetingEvent,
  startInMeetingCountdown,
} from "./countdown.js";

/** Get milliseconds before meeting start to open browser, based on settings */
function getOpenBeforeMs(): number {
  return getSettings().openBeforeMinutes * 60 * 1000;
}

/** Don't schedule events that start more than this far in the future */
const MAX_SCHEDULE_AHEAD_MS = 24 * 60 * 60 * 1000; // 24 hours

export function setSchedulerWindow(w: BrowserWindow): void {
  state.win = w;
}

/** Set the tray title update callback — called from main/index.ts to decouple scheduler from tray */
export function setTrayTitleCallback(
  fn: (
    title: string | null,
    minsRemaining?: number,
    inMeeting?: boolean,
  ) => void,
): void {
  state.onTrayTitleUpdate = fn;
}

/** Cached Proxy views over scheduler state Maps/Sets — avoids repeated Proxy property lookups. */
interface StateLocals {
  readonly timers: typeof state.timers;
  readonly alertTimers: typeof state.alertTimers;
  readonly titleTimers: typeof state.titleTimers;
  readonly countdownIntervals: typeof state.countdownIntervals;
  readonly clearTimers: typeof state.clearTimers;
  readonly inMeetingIntervals: typeof state.inMeetingIntervals;
  readonly firedEvents: typeof state.firedEvents;
  readonly alertFiredEvents: typeof state.alertFiredEvents;
  readonly scheduledEventData: typeof state.scheduledEventData;
}

/**
 * Handle an event whose start time is in the past.
 * If the meeting is still in progress, starts the in-meeting countdown
 * and cleans up any pending future timers.
 * Returns true if the event was handled (caller should `continue`).
 */
function handleInProgressEvent(
  event: MeetingEvent,
  startMs: number,
  endMs: number,
  now: number,
  activeIds: Set<string>,
  s: StateLocals,
): boolean {
  if (startMs > now) return false;

  // Meeting already ended
  if (endMs <= now) return true;

  // Meeting in progress — start in-meeting countdown
  activeIds.add(event.id);

  // Clean up any pending future timers (e.g., event rescheduled to past)
  cancelBrowserTimer(event.id, s.timers);
  cancelAlertTimer(event.id, s.alertTimers);
  cancelTitleCountdown(event.id, s.titleTimers, s.countdownIntervals, s.clearTimers);

  // Only clear fired flags if event hasn't fired yet — preserve if already fired
  if (!s.firedEvents.has(event.id)) {
    s.firedEvents.delete(event.id);
    s.alertFiredEvents.delete(event.id);
  }

  if (!s.inMeetingIntervals.has(event.id)) {
    s.scheduledEventData.set(event.id, {
      title: event.title,
      meetUrl: event.meetUrl,
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
  s: StateLocals,
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

  // Not yet scheduled — nothing to compare
  if (!s.timers.has(event.id)) return false;

  const prevData = s.scheduledEventData.get(event.id);
  if (!prevData) return false;

  const timeChanged = prevData.startMs !== startMs;
  const titleChanged = prevData.title !== event.title;
  const urlChanged = prevData.meetUrl !== event.meetUrl;

  if (!timeChanged && !titleChanged && !urlChanged) return true; // nothing changed

  if (!timeChanged) {
    // Only metadata changed — update snapshot in-place
    s.scheduledEventData.set(event.id, {
      title: event.title,
      meetUrl: event.meetUrl,
      startMs,
      endMs,
    });

    if (urlChanged) {
      cancelBrowserTimer(event.id, s.timers);
      cancelAlertTimer(event.id, s.alertTimers);
      console.log(
        `[scheduler] URL changed for "${event.title}" — rescheduling browser open`,
      );
      // fall through — caller will schedule new timers
      return false;
    }

    // Title-only change — update tray immediately if this event owns the title
    if (state.activeTitleEventId === event.id) {
      const remaining = Math.ceil((startMs - Date.now()) / 60_000);
      if (remaining > 0)
        state.onTrayTitleUpdate?.(event.title, remaining);
    }
    console.log(`[scheduler] Title updated for "${event.title}"`);
    return true; // no timer changes needed
  }

  // Start time changed — cancel all timers and fully reschedule
  cancelBrowserTimer(event.id, s.timers);
  cancelAlertTimer(event.id, s.alertTimers);
  s.scheduledEventData.delete(event.id);
  s.firedEvents.delete(event.id); // allow re-fire at new time
  s.alertFiredEvents.delete(event.id); // allow re-alert at new time
  console.log(
    `[scheduler] Rescheduled "${event.title}" — start time changed`,
  );
  return false; // fall through to schedule new timer
}

/** Schedule all timers (alert, browser, title countdown) for a future event. */
function scheduleFutureTimers(
  event: MeetingEvent,
  delayMs: number,
  startMs: number,
  endMs: number,
  now: number,
  s: StateLocals,
): void {
  const effectiveDelay = Math.max(0, delayMs);

  // Alert timer (fires 1 minute before browser timer)
  const alertSettings = getSettings();
  if (alertSettings.windowAlert && !s.alertFiredEvents.has(event.id)) {
    scheduleAlertTimer(event, effectiveDelay, s.alertTimers, s.alertFiredEvents);
  }

  scheduleBrowserTimer(event, effectiveDelay, startMs, endMs, s.timers, s.firedEvents, s.scheduledEventData);

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
  const activeIds = new Set<string>();

  const s: StateLocals = {
    timers: state.timers,
    alertTimers: state.alertTimers,
    titleTimers: state.titleTimers,
    countdownIntervals: state.countdownIntervals,
    clearTimers: state.clearTimers,
    inMeetingIntervals: state.inMeetingIntervals,
    firedEvents: state.firedEvents,
    alertFiredEvents: state.alertFiredEvents,
    scheduledEventData: state.scheduledEventData,
  };

  for (const event of events) {
    if (event.isAllDay) continue;

    const startMs = new Date(event.startDate).getTime();
    const endMs = new Date(event.endDate).getTime();
    const openAtMs = startMs - getOpenBeforeMs();
    const delayMs = openAtMs - now;

    if (handleInProgressEvent(event, startMs, endMs, now, activeIds, s)) continue;
    if (delayMs > MAX_SCHEDULE_AHEAD_MS) continue;

    activeIds.add(event.id);

    if (shouldSkipScheduledEvent(event, startMs, endMs, s)) continue;

    scheduleFutureTimers(event, delayMs, startMs, endMs, now, s);
  }

  markTitleDirty();
  markInMeetingDirty();
  // Cancel timers for events that are no longer in the list (e.g. cancelled meetings)
  cancelStaleEntries(state, activeIds, {
    onBrowserCancel: cancelBrowserTimer,
    onAlertCancel: cancelAlertTimer,
    onCountdownIntervalCancel: () => {
      state.powerCallbacks?.allowSleep?.();
    },
  });

  // After cleanup, re-resolve tray title ownership
  // (handles the case where the active countdown event was just removed)
  resolveActiveInMeetingEvent();
}

