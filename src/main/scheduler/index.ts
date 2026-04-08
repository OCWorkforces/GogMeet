import { getSettings } from "../settings.js";
import { scheduleAlertTimer, cancelAlertTimer } from "./alert-timer.js";
import { scheduleBrowserTimer, cancelBrowserTimer } from "./browser-timer.js";
import { scheduleTitleCountdown, cancelTitleCountdown } from "./title-countdown.js";

import type { BrowserWindow } from "electron";
import type { MeetingEvent } from "../../shared/models.js";
import { allowSleep } from "../power.js";

import {
  state,
  markTitleDirty,
  markInMeetingDirty,
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

/**
 * Schedule or re-schedule browser-open timers for the given events.
 * Safe to call multiple times — clears stale timers for removed events.
 */
export function scheduleEvents(events: MeetingEvent[]): void {
  const now = Date.now();
  const activeIds = new Set<string>();

  // Cache Proxy views into locals — avoids repeated Proxy property lookups
  const stateTimers = state.timers;
  const stateAlertTimers = state.alertTimers;
  const stateTitleTimers = state.titleTimers;
  const stateCountdownIntervals = state.countdownIntervals;
  const stateClearTimers = state.clearTimers;
  const stateInMeetingIntervals = state.inMeetingIntervals;
  const stateInMeetingEndTimers = state.inMeetingEndTimers;
  const stateFiredEvents = state.firedEvents;
  const stateAlertFiredEvents = state.alertFiredEvents;
  const stateScheduledEventData = state.scheduledEventData;

  for (const event of events) {
    if (event.isAllDay) continue;

    const startMs = new Date(event.startDate).getTime();
    const endMs = new Date(event.endDate).getTime();
    const openAtMs = startMs - getOpenBeforeMs();
    const delayMs = openAtMs - now;

    // Handle already-in-progress events
    if (startMs <= now) {
      // Check if meeting is currently in progress
      if (endMs > now) {
        // Meeting in progress — start in-meeting countdown
        activeIds.add(event.id);

        // --- Clean up any pending future timers (e.g., event rescheduled to past) ---
        cancelBrowserTimer(event.id, stateTimers);
        cancelAlertTimer(event.id, stateAlertTimers);
        cancelTitleCountdown(event.id, stateTitleTimers, stateCountdownIntervals, stateClearTimers);
        // Only clear fired flags if event hasn't fired yet - preserve if already fired
        if (!stateFiredEvents.has(event.id)) {
          stateFiredEvents.delete(event.id);
          stateAlertFiredEvents.delete(event.id);
        }

        if (!stateInMeetingIntervals.has(event.id)) {
          stateScheduledEventData.set(event.id, {
            title: event.title,
            meetUrl: event.meetUrl,
            startMs,
            endMs,
          });
          startInMeetingCountdown(event.id, { title: event.title, endMs });
        }
      }
      continue;
    }
    if (delayMs > MAX_SCHEDULE_AHEAD_MS) continue;

    activeIds.add(event.id);

    // Already fired — check if time changed
    if (stateFiredEvents.has(event.id)) {
      const prevData = stateScheduledEventData.get(event.id);
      if (prevData && prevData.startMs !== startMs) {
        // Start time changed after browser already opened — allow reschedule
        stateFiredEvents.delete(event.id);
        stateAlertFiredEvents.delete(event.id);
      } else {
        continue; // already fired, no change
      }
    }

    // Already scheduled — check what changed
    if (stateTimers.has(event.id)) {
      const prevData = stateScheduledEventData.get(event.id);
      if (prevData) {
        const timeChanged = prevData.startMs !== startMs;
        const titleChanged = prevData.title !== event.title;
        const urlChanged = prevData.meetUrl !== event.meetUrl;

        if (!timeChanged && !titleChanged && !urlChanged) continue; // nothing changed

        if (!timeChanged) {
          // Only metadata changed — update snapshot and refresh in-place (no timer reschedule)
          stateScheduledEventData.set(event.id, {
            title: event.title,
            meetUrl: event.meetUrl,
            startMs,
            endMs,
          });

          if (urlChanged) {
            cancelBrowserTimer(event.id, stateTimers);
            // Also clear alert timer if rescheduling
            cancelAlertTimer(event.id, stateAlertTimers);
            // fall through below to schedule new browser timer (same start time)
            console.log(
              `[scheduler] URL changed for "${event.title}" — rescheduling browser open`,
            );
          } else {
            // Title-only change — update tray immediately if this event owns the title
            if (state.activeTitleEventId === event.id) {
              const remaining = Math.ceil((startMs - Date.now()) / 60_000);
              if (remaining > 0)
                state.onTrayTitleUpdate?.(event.title, remaining);
            }
            console.log(`[scheduler] Title updated for "${event.title}"`);
            continue; // no timer changes needed
          }
        } else {
          // Start time changed — cancel all timers and fully reschedule
          cancelBrowserTimer(event.id, stateTimers);
          // Also clear alert timer when start time changes
          cancelAlertTimer(event.id, stateAlertTimers);
          stateScheduledEventData.delete(event.id);
          stateFiredEvents.delete(event.id); // allow re-fire at new time
          stateAlertFiredEvents.delete(event.id); // allow re-alert at new time
          console.log(
            `[scheduler] Rescheduled "${event.title}" — start time changed`,
          );
          // fall through to schedule new timer
        }
      }
    }

    const effectiveDelay = Math.max(0, delayMs);

    // --- Separate alert timer (fires 1 minute before browser timer) ---
    // Only schedule if windowAlert is enabled and not already fired
    const alertSettings = getSettings();
    if (alertSettings.windowAlert && !stateAlertFiredEvents.has(event.id)) {
      scheduleAlertTimer(event, effectiveDelay, stateAlertTimers, stateAlertFiredEvents);
    }

    scheduleBrowserTimer(event, effectiveDelay, startMs, endMs, stateTimers, stateFiredEvents, stateScheduledEventData);

    // --- 30-min tray title countdown ---
    scheduleTitleCountdown(
      { eventId: event.id, eventTitle: event.title, startMs, endMs, now },
      stateTitleTimers,
      stateCountdownIntervals,
      stateClearTimers,
    );
  }

  markTitleDirty();
  markInMeetingDirty();
  // Cancel timers for events that are no longer in the list (e.g. cancelled meetings)
  // Batch cleanup: remove stale entries from all timer maps in individual passes
  for (const id of stateTimers.keys()) {
    if (!activeIds.has(id)) {
      cancelBrowserTimer(id, stateTimers);
      console.log("[scheduler] Cancelled timer for removed event");
    }
  }
  for (const [id] of stateAlertTimers) {
    if (!activeIds.has(id)) {
      cancelAlertTimer(id, stateAlertTimers);
      console.log("[scheduler] Cancelled alert timer for removed event");
    }
  }
  for (const [id, handle] of stateTitleTimers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      stateTitleTimers.delete(id);
    }
  }
  for (const [id, handle] of stateCountdownIntervals) {
    if (!activeIds.has(id)) {
      clearInterval(handle);
      allowSleep();
      stateCountdownIntervals.delete(id);
    }
  }
  for (const [id, handle] of stateClearTimers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      stateClearTimers.delete(id);
    }
  }
  for (const [id, handle] of stateInMeetingIntervals) {
    if (!activeIds.has(id)) {
      clearInterval(handle);
      stateInMeetingIntervals.delete(id);
    }
  }
  for (const [id, handle] of stateInMeetingEndTimers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      stateInMeetingEndTimers.delete(id);
    }
  }

  // Prune firedEvents, alertFiredEvents and scheduledEventData for events no longer in the active list
  for (const id of stateFiredEvents) {
    if (!activeIds.has(id)) {
      stateFiredEvents.delete(id);
    }
  }
  for (const id of stateAlertFiredEvents) {
    if (!activeIds.has(id)) {
      stateAlertFiredEvents.delete(id);
    }
  }
  for (const id of stateScheduledEventData.keys()) {
    if (!activeIds.has(id)) {
      stateScheduledEventData.delete(id);
    }
  }

  // After cleanup, re-resolve tray title ownership
  // (handles the case where the active countdown event was just removed)
  resolveActiveInMeetingEvent();
}

export {
  poll,
  startScheduler,
  stopScheduler,
  restartScheduler,
  _resetForTest,
  _resetConsecutiveErrors,
} from "./poll.js";
