import { Notification, shell } from "electron";
import { getSettings } from "../settings.js";
import { showAlert } from "../alert-window.js";

import { getCalendarEventsResult } from "../calendar.js";
import type { BrowserWindow } from "electron";
import type { MeetingEvent } from "../../shared/models.js";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import { buildMeetUrl } from "../utils/meet-url.js";
import { getPollInterval, preventSleep, allowSleep } from "../power.js";

import {
  state,
  resetState,
  setActiveTitleEventId,
  setConsecutiveErrors,
  setActiveInMeetingEventId,
  incrementConsecutiveErrors,
  markTitleDirty,
  markInMeetingDirty,
} from "./state.js";

import {
  resolveActiveTitleEvent,
  resolveActiveInMeetingEvent,
  startInMeetingCountdown,
  clearAllDisplayTimers,
} from "./countdown.js";

/** Get milliseconds before meeting start to open browser, based on settings */
function getOpenBeforeMs(): number {
  return getSettings().openBeforeMinutes * 60 * 1000;
}

/** How long before meeting start to show the tray title (ms) */
const TITLE_BEFORE_MS = 30 * 60 * 1000; // 30 minutes
/** Don't schedule events that start more than this far in the future */
const MAX_SCHEDULE_AHEAD_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Number of consecutive poll errors before force-clearing the tray title (~6 min) */
const MAX_CONSECUTIVE_ERRORS = 3;

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
        const pendingTimer = stateTimers.get(event.id);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          stateTimers.delete(event.id);
        }
        const pendingAlert = stateAlertTimers.get(event.id);
        if (pendingAlert) {
          clearTimeout(pendingAlert);
          stateAlertTimers.delete(event.id);
        }
        const pendingTitle = stateTitleTimers.get(event.id);
        if (pendingTitle) {
          clearTimeout(pendingTitle);
          stateTitleTimers.delete(event.id);
        }
        const pendingCountdown = stateCountdownIntervals.get(event.id);
        if (pendingCountdown) {
          clearInterval(pendingCountdown);
          markTitleDirty();
          allowSleep();
          stateCountdownIntervals.delete(event.id);
        }
        const pendingClear = stateClearTimers.get(event.id);
        if (pendingClear) {
          clearTimeout(pendingClear);
          stateClearTimers.delete(event.id);
        }
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
            const existingTimer = stateTimers.get(event.id);
            if (existingTimer) {
              clearTimeout(existingTimer);
            }
            stateTimers.delete(event.id);
            // Also clear alert timer if rescheduling
            const existingAlertTimer = stateAlertTimers.get(event.id);
            if (existingAlertTimer) {
              clearTimeout(existingAlertTimer);
              stateAlertTimers.delete(event.id);
            }
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
          const existingTimer = stateTimers.get(event.id);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }
          stateTimers.delete(event.id);
          // Also clear alert timer when start time changes
          const existingAlertTimer = stateAlertTimers.get(event.id);
          if (existingAlertTimer) {
            clearTimeout(existingAlertTimer);
            stateAlertTimers.delete(event.id);
          }
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
      // Cancel any existing alert timer for this event
      const existingAlertTimer = stateAlertTimers.get(event.id);
      if (existingAlertTimer) {
        clearTimeout(existingAlertTimer);
        stateAlertTimers.delete(event.id);
      }

      // Alert fires 1 minute before the browser open
      const ALERT_OFFSET_MS = 60 * 1000;
      const alertDelayMs = Math.max(0, effectiveDelay - ALERT_OFFSET_MS);
      const alertHandle = setTimeout(() => {
        stateAlertTimers.delete(event.id);
        stateAlertFiredEvents.add(event.id);
        try {
          showAlert(event);
        } catch {
          // Non-critical — alert is optional UX
        }
        console.log(
          `[scheduler] Alert shown for "${event.title}" (${Math.round(alertDelayMs / 1000)}s before meeting)`,
        );
      }, alertDelayMs);
      stateAlertTimers.set(event.id, alertHandle);
    }

    const handle = setTimeout(() => {
      stateTimers.delete(event.id);
      stateFiredEvents.add(event.id);
      // Always show notification for all meetings
      new Notification({
        title: event.title,
        body: "Starting now",
      }).show();
      // Open browser for meetings with a URL (alert dismiss doesn't prevent this)
      if (!event.meetUrl) {
        console.log(
          `[scheduler] Notification shown for "${event.title}" (no URL)`,
        );
        return;
      }
      const url = buildMeetUrl(event);
      shell.openExternal(url).catch((err) => {
        console.error(`[scheduler] Failed to open ${url}:`, err);
      });
      console.log(`[scheduler] Opened browser for "${event.title}" → ${url}`);
    }, effectiveDelay);

    stateTimers.set(event.id, handle);
    stateScheduledEventData.set(event.id, {
      title: event.title,
      meetUrl: event.meetUrl,
      startMs,
      endMs,
    });
    console.log(
      `[scheduler] Scheduled "${event.title}" to open in ${Math.round(effectiveDelay / 1000)}s`,
    );

    // --- 30-min tray title countdown ---
    // Cancel any existing title/countdown/clear timers before (re-)scheduling
    const existingTitleTimer = stateTitleTimers.get(event.id);
    if (existingTitleTimer) {
      clearTimeout(existingTitleTimer);
      stateTitleTimers.delete(event.id);
    }
    const existingCountdown = stateCountdownIntervals.get(event.id);
    if (existingCountdown) {
      clearInterval(existingCountdown);
      allowSleep();
      stateCountdownIntervals.delete(event.id);
    }
    const existingClearTimer = stateClearTimers.get(event.id);
    if (existingClearTimer) {
      clearTimeout(existingClearTimer);
      stateClearTimers.delete(event.id);
    }

    /** Compute whole minutes remaining until startMs and update tray */
    function tickCountdown(): void {
      // Only update tray if this event currently owns the title
      if (event.id !== state.activeTitleEventId) return;
      const data = state.scheduledEventData.get(event.id);
      if (!data) return;
      const remaining = Math.ceil((data.startMs - Date.now()) / 60_000);
      if (remaining > 0) {
        state.onTrayTitleUpdate?.(data.title, remaining);
      }
    }

    /** Start per-minute countdown interval and schedule clear at startMs */
    function startCountdown(): void {
      // Guard: bail if event was deleted between titleTimer fire and now
      if (!state.scheduledEventData.has(event.id)) return;

      preventSleep();
      tickCountdown(); // immediate tick so title appears right away — sets ownership via resolveActiveTitleEvent below
      const intervalHandle = setInterval(() => {
        tickCountdown();
      }, 60_000);
      state.countdownIntervals.set(event.id, intervalHandle);
      markTitleDirty();
      console.log(`[scheduler] Countdown started for "${event.title}"`);

      // Resolve ownership so tray title reflects earliest-starting meeting
      resolveActiveTitleEvent();

      const clearHandle = setTimeout(
        () => {
          // Clear pre-meeting countdown
          const countdown = state.countdownIntervals.get(event.id);
          if (countdown) {
            clearInterval(countdown);
          }
          state.countdownIntervals.delete(event.id);
          markTitleDirty();
          allowSleep();
          state.clearTimers.delete(event.id);
          if (state.activeTitleEventId === event.id) {
            setActiveTitleEventId(null);
          }

          // Start in-meeting countdown
          const data = state.scheduledEventData.get(event.id);
          if (data) {
            startInMeetingCountdown(event.id, data);
          } else {
            resolveActiveTitleEvent();
          }

          console.log(`[scheduler] Meeting started: "${event.title}"`);
        },
        Math.max(0, startMs - Date.now()),
      );
      state.clearTimers.set(event.id, clearHandle);
    }

    const titleAtMs = startMs - TITLE_BEFORE_MS;
    const titleDelayMs = titleAtMs - now;

    if (titleDelayMs > 0) {
      // Title starts in the future — schedule the countdown to begin then
      const titleHandle = setTimeout(() => {
        stateTitleTimers.delete(event.id);
        startCountdown();
      }, titleDelayMs);
      stateTitleTimers.set(event.id, titleHandle);
      console.log(
        `[scheduler] Title timer set for "${event.title}" in ${Math.round(titleDelayMs / 1000)}s`,
      );
    } else if (startMs > now) {
      // Already inside the 30-min window — start countdown immediately
      startCountdown();
    }
  }

  markTitleDirty();
  markInMeetingDirty();
  // Cancel timers for events that are no longer in the list (e.g. cancelled meetings)
  // Batch cleanup: remove stale entries from all timer maps in individual passes
  for (const [id, handle] of stateTimers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      stateTimers.delete(id);
      console.log("[scheduler] Cancelled timer for removed event");
    }
  }
  for (const [id, handle] of stateAlertTimers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      stateAlertTimers.delete(id);
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

/** Poll calendar and refresh timers */
export async function poll(): Promise<void> {
  try {
    const result = await getCalendarEventsResult();
    if ("events" in result) {
      setConsecutiveErrors(0);
      scheduleEvents(result.events);
      // Notify renderer of updated events
      if (state.win && !state.win.isDestroyed()) {
        state.win.webContents.send(IPC_CHANNELS.CALENDAR_EVENTS_UPDATED);
      }
    } else {
      console.error("[scheduler] Calendar error:", result.error);
      incrementConsecutiveErrors();
      if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        markTitleDirty();
        markInMeetingDirty();
        clearAllDisplayTimers();
        setActiveInMeetingEventId(null);
        resolveActiveTitleEvent();
        console.error(
          `[scheduler] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — cleared tray title`,
        );
      }
    }
  } catch (err) {
    console.error("[scheduler] Poll error:", err);
    incrementConsecutiveErrors();
    if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      markTitleDirty();
      markInMeetingDirty();
      clearAllDisplayTimers();
      setActiveInMeetingEventId(null);
      resolveActiveTitleEvent();
      console.error(
        `[scheduler] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — cleared tray title`,
      );
    }
  }
}

/** Start the scheduler — call once from app.whenReady() */
export function startScheduler(): void {
  if (state.pollTimeout !== null) return; // already running

  // Initial poll immediately
  void poll();

  // Then poll with recursive setTimeout (prevents drift/overlap)
  function scheduleNextPoll(): void {
    state.pollTimeout = setTimeout(async () => {
      await poll();
      if (state.pollTimeout !== null) {
        scheduleNextPoll();
      }
    }, getPollInterval());
  }
  scheduleNextPoll();
}

/** Stop the scheduler and clear all pending timers — call on before-quit */
export function stopScheduler(): void {
  resetState({ preserveWindow: true });
  state.onTrayTitleUpdate?.(null);
  console.log("[scheduler] Stopped");
}

/** Restart the scheduler - call when settings change to apply new timing */
export function restartScheduler(): void {
  stopScheduler();
  startScheduler();
}

/** Reset mutable state for tests — not for production use */
export function _resetForTest(): void {
  resetState();
}

/** Backward-compatible alias for existing tests */
export function _resetConsecutiveErrors(): void {
  _resetForTest();
}
