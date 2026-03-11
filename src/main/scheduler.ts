import { Notification, shell } from "electron";
import { getCalendarEventsResult } from "./calendar.js";
import type { MeetingEvent } from "../shared/types.js";
import { updateTrayTitle } from "./tray.js";
import { buildMeetUrl } from "./utils/meet-url.js";
/** How long before meeting start to open the browser (ms) */
const OPEN_BEFORE_MS = 60 * 1000; // 1 minute

/** How long before meeting start to show the tray title (ms) */
const TITLE_BEFORE_MS = 30 * 60 * 1000; // 30 minutes

/** How often to re-poll calendar events (ms) */
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/** Don't schedule events that start more than this far in the future */
const MAX_SCHEDULE_AHEAD_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Map of eventId → active open-browser timer handle */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Map of eventId → setTimeout handle that fires when the 30-min window opens */
const titleTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Map of eventId → setInterval handle for the per-minute countdown tick */
const countdownIntervals = new Map<string, ReturnType<typeof setInterval>>();

/** Map of eventId → setTimeout handle that fires at meeting start to clear title */
const clearTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Map of eventId → setInterval handle for per-minute in-meeting countdown */
const inMeetingIntervals = new Map<string, ReturnType<typeof setInterval>>();

/** Map of eventId → setTimeout handle that fires at meeting END */
const inMeetingEndTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Which event currently owns the in-meeting tray title */
let activeInMeetingEventId: string | null = null;

/** Map of eventId → stored event snapshot for change detection (replaces scheduledStartMs) */
const scheduledEventData = new Map<
  string,
  {
    title: string;
    meetUrl: string | undefined;
    startMs: number;
    endMs: number;
  }
>();

/** Set of eventIds that have already fired (prevents re-fire on refresh) */
const firedEvents = new Set<string>();

/** Which event currently owns the tray title display (null = no countdown active) */
let activeTitleEventId: string | null = null;

/** Counter of consecutive calendar fetch errors — reset to 0 on success */
let consecutiveErrors = 0;

/** Number of consecutive poll errors before force-clearing the tray title (~6 min) */
const MAX_CONSECUTIVE_ERRORS = 3;

/** Active poll interval handle */
let pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Clear all display-related timers (countdown and in-meeting).
 * Used when clearing tray title after consecutive errors.
 */
function clearAllDisplayTimers(): void {
  for (const handle of countdownIntervals.values()) clearInterval(handle);
  countdownIntervals.clear();
  for (const handle of clearTimers.values()) clearTimeout(handle);
  clearTimers.clear();
  for (const handle of inMeetingIntervals.values()) clearInterval(handle);
  inMeetingIntervals.clear();
  for (const handle of inMeetingEndTimers.values()) clearTimeout(handle);
  inMeetingEndTimers.clear();
}

/**
 * Generic helper to cleanup stale entries from a map.
 * Removes entries not in the active set, calling clearFn on each removed value.
 */
function cleanupStaleEntries<K, V>(
  map: Map<K, V>,
  activeIds: Set<K>,
  clearFn: (v: V) => void,
): void {
  for (const [id, handle] of map) {
    if (!activeIds.has(id)) {
      clearFn(handle);
      map.delete(id);
    }
  }
}

/**
 * Determine which event should own the tray title.
 * Policy: earliest startMs among events with an active countdownInterval wins.
 * Updates the tray immediately if ownership changes.
 */
function resolveActiveTitleEvent(): void {
  // In-meeting events take priority — don't overwrite
  if (
    activeInMeetingEventId &&
    inMeetingIntervals.has(activeInMeetingEventId)
  ) {
    return;
  }

  let bestId: string | null = null;
  let bestStartMs = Infinity;

  for (const id of countdownIntervals.keys()) {
    const data = scheduledEventData.get(id);
    if (data && data.startMs < bestStartMs) {
      bestStartMs = data.startMs;
      bestId = id;
    }
  }

  activeTitleEventId = bestId;

  if (bestId) {
    const data = scheduledEventData.get(bestId);
    if (data) {
      const remaining = Math.ceil((data.startMs - Date.now()) / 60_000);
      if (remaining > 0) {
        updateTrayTitle(data.title, remaining);
      }
    }
  } else {
    updateTrayTitle(null);
  }
}

/**
 * Determine which in-meeting event should own the tray title.
 * Policy: event ending soonest wins.
 */
function resolveActiveInMeetingEvent(): void {
  let bestId: string | null = null;
  let bestEndMs = Infinity;

  for (const id of inMeetingIntervals.keys()) {
    const data = scheduledEventData.get(id);
    if (data && data.endMs < bestEndMs) {
      bestEndMs = data.endMs;
      bestId = id;
    }
  }

  activeInMeetingEventId = bestId;

  if (bestId) {
    const data = scheduledEventData.get(bestId);
    if (data) {
      const remaining = Math.ceil((data.endMs - Date.now()) / 60_000);
      if (remaining > 0) {
        updateTrayTitle(data.title, remaining, true);
      }
    }
  } else {
    // No in-meeting event — fall back to pre-meeting
    resolveActiveTitleEvent();
  }
}

/** Start per-minute countdown showing remaining time until meeting ends */
function startInMeetingCountdown(
  eventId: string,
  data: { title: string; endMs: number },
): void {
  const now = Date.now();
  if (data.endMs <= now) return; // already ended

  function tickInMeeting(): void {
    if (eventId !== activeInMeetingEventId) return;
    const currentData = scheduledEventData.get(eventId);
    if (!currentData) return;
    const remaining = Math.ceil((currentData.endMs - Date.now()) / 60_000);
    if (remaining > 0) {
      updateTrayTitle(currentData.title, remaining, true);
    }
  }

  // Immediate tick + per-minute interval
  const intervalHandle = setInterval(tickInMeeting, 60_000);
  inMeetingIntervals.set(eventId, intervalHandle);

  // Resolve ownership, then do first tick
  resolveActiveInMeetingEvent();

  console.log(`[scheduler] In-meeting countdown started for "${data.title}"`);

  // Set timer to clear at meeting end
  const endHandle = setTimeout(() => {
    const interval = inMeetingIntervals.get(eventId);
    if (interval) {
      clearInterval(interval);
    }
    inMeetingIntervals.delete(eventId);
    inMeetingEndTimers.delete(eventId);
    scheduledEventData.delete(eventId);
    if (activeInMeetingEventId === eventId) {
      activeInMeetingEventId = null;
    }
    resolveActiveInMeetingEvent();
    console.log(`[scheduler] Meeting ended: "${data.title}"`);
  }, data.endMs - now);

  inMeetingEndTimers.set(eventId, endHandle);
}

/**
 * Schedule or re-schedule browser-open timers for the given events.
 * Safe to call multiple times — clears stale timers for removed events.
 */
export function scheduleEvents(events: MeetingEvent[]): void {
  const now = Date.now();
  const activeIds = new Set<string>();

  for (const event of events) {
    if (event.isAllDay) continue;

    const startMs = new Date(event.startDate).getTime();
    const endMs = new Date(event.endDate).getTime();
    const openAtMs = startMs - OPEN_BEFORE_MS;
    const delayMs = openAtMs - now;

    // Handle already-in-progress events
    if (startMs <= now) {
      // Check if meeting is currently in progress
      if (endMs > now) {
        // Meeting in progress — start in-meeting countdown
        activeIds.add(event.id);
        if (!inMeetingIntervals.has(event.id)) {
          scheduledEventData.set(event.id, {
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

    // Already fired — skip
    if (firedEvents.has(event.id)) continue;

    // Already scheduled — check what changed
    if (timers.has(event.id)) {
      const prevData = scheduledEventData.get(event.id);
      if (prevData) {
        const timeChanged = prevData.startMs !== startMs;
        const titleChanged = prevData.title !== event.title;
        const urlChanged = prevData.meetUrl !== event.meetUrl;

        if (!timeChanged && !titleChanged && !urlChanged) continue; // nothing changed

        if (!timeChanged) {
          // Only metadata changed — update snapshot and refresh in-place (no timer reschedule)
          scheduledEventData.set(event.id, {
            title: event.title,
            meetUrl: event.meetUrl,
            startMs,
            endMs,
          });

          if (urlChanged) {
            // Reschedule the browser-open timer with the new URL
            const existingTimer = timers.get(event.id);
            if (existingTimer) {
              clearTimeout(existingTimer);
            }
            timers.delete(event.id);
            // fall through below to schedule new browser timer (same start time)
            console.log(
              `[scheduler] URL changed for "${event.title}" — rescheduling browser open`,
            );
          } else {
            // Title-only change — update tray immediately if this event owns the title
            if (activeTitleEventId === event.id) {
              const remaining = Math.ceil((startMs - Date.now()) / 60_000);
              if (remaining > 0) updateTrayTitle(event.title, remaining);
            }
            console.log(`[scheduler] Title updated for "${event.title}"`);
            continue; // no timer changes needed
          }
        } else {
          // Start time changed — cancel all timers and fully reschedule
          const existingTimer = timers.get(event.id);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }
          timers.delete(event.id);
          scheduledEventData.delete(event.id);
          firedEvents.delete(event.id); // allow re-fire at new time
          console.log(
            `[scheduler] Rescheduled "${event.title}" — start time changed`,
          );
          // fall through to schedule new timer
        }
      }
    }

    const effectiveDelay = Math.max(0, delayMs);

    const handle = setTimeout(() => {
      timers.delete(event.id);
      scheduledEventData.delete(event.id);
      firedEvents.add(event.id);
      if (!event.meetUrl) return; // no URL — nothing to open
      new Notification({
        title: "Meeting Starting",
        body: event.title,
      }).show();
      const url = buildMeetUrl(event);
      shell.openExternal(url).catch((err) => {
        console.error(`[scheduler] Failed to open ${url}:`, err);
      });
      console.log(`[scheduler] Opened browser for "${event.title}" → ${url}`);
    }, effectiveDelay);

    timers.set(event.id, handle);
    scheduledEventData.set(event.id, {
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
    const existingTitleTimer = titleTimers.get(event.id);
    if (existingTitleTimer) {
      clearTimeout(existingTitleTimer);
      titleTimers.delete(event.id);
    }
    const existingCountdown = countdownIntervals.get(event.id);
    if (existingCountdown) {
      clearInterval(existingCountdown);
      countdownIntervals.delete(event.id);
    }
    const existingClearTimer = clearTimers.get(event.id);
    if (existingClearTimer) {
      clearTimeout(existingClearTimer);
      clearTimers.delete(event.id);
    }

    /** Compute whole minutes remaining until startMs and update tray */
    function tickCountdown(): void {
      // Only update tray if this event currently owns the title
      if (event.id !== activeTitleEventId) return;
      const data = scheduledEventData.get(event.id);
      if (!data) return;
      const remaining = Math.ceil((data.startMs - Date.now()) / 60_000);
      if (remaining > 0) {
        updateTrayTitle(data.title, remaining);
      }
    }

    /** Start per-minute countdown interval and schedule clear at startMs */
    function startCountdown(): void {
      // Guard: bail if event was deleted between titleTimer fire and now
      if (!scheduledEventData.has(event.id)) return;

      tickCountdown(); // immediate tick so title appears right away — sets ownership via resolveActiveTitleEvent below
      const intervalHandle = setInterval(() => {
        tickCountdown();
      }, 60_000);
      countdownIntervals.set(event.id, intervalHandle);
      console.log(`[scheduler] Countdown started for "${event.title}"`);

      // Resolve ownership so tray title reflects earliest-starting meeting
      resolveActiveTitleEvent();

      const clearHandle = setTimeout(
        () => {
          // Clear pre-meeting countdown
          const countdown = countdownIntervals.get(event.id);
          if (countdown) {
            clearInterval(countdown);
          }
          countdownIntervals.delete(event.id);
          clearTimers.delete(event.id);
          if (activeTitleEventId === event.id) {
            activeTitleEventId = null;
          }

          // Start in-meeting countdown
          const data = scheduledEventData.get(event.id);
          if (data) {
            startInMeetingCountdown(event.id, data);
          } else {
            resolveActiveTitleEvent();
          }

          console.log(`[scheduler] Meeting started: "${event.title}"`);
        },
        Math.max(0, startMs - Date.now()),
      );
      clearTimers.set(event.id, clearHandle);
    }

    const titleAtMs = startMs - TITLE_BEFORE_MS;
    const titleDelayMs = titleAtMs - now;

    if (titleDelayMs > 0) {
      // Title starts in the future — schedule the countdown to begin then
      const titleHandle = setTimeout(() => {
        titleTimers.delete(event.id);
        startCountdown();
      }, titleDelayMs);
      titleTimers.set(event.id, titleHandle);
      console.log(
        `[scheduler] Title timer set for "${event.title}" in ${Math.round(titleDelayMs / 1000)}s`,
      );
    } else if (startMs > now) {
      // Already inside the 30-min window — start countdown immediately
      startCountdown();
    }
  }

  // Cancel timers for events that are no longer in the list (e.g. cancelled meetings)
  cleanupStaleEntries(timers, activeIds, (h) => {
    clearTimeout(h);
    console.log("[scheduler] Cancelled timer for removed event");
  });
  cleanupStaleEntries(titleTimers, activeIds, (h) => clearTimeout(h));
  cleanupStaleEntries(countdownIntervals, activeIds, (h) => clearInterval(h));
  cleanupStaleEntries(clearTimers, activeIds, (h) => clearTimeout(h));
  // Cleanup stale in-meeting timers
  cleanupStaleEntries(inMeetingIntervals, activeIds, (h) => clearInterval(h));
  cleanupStaleEntries(inMeetingEndTimers, activeIds, (h) => clearTimeout(h));

  // Prune firedEvents and scheduledEventData for events no longer in the active list
  for (const id of firedEvents) {
    if (!activeIds.has(id)) {
      firedEvents.delete(id);
    }
  }
  for (const id of scheduledEventData.keys()) {
    if (!activeIds.has(id)) {
      scheduledEventData.delete(id);
    }
  }

  // After cleanup, re-resolve tray title ownership
  // (handles the case where the active countdown event was just removed)
  resolveActiveInMeetingEvent();
}

/** Poll calendar and refresh timers */
async function poll(): Promise<void> {
  try {
    const result = await getCalendarEventsResult();
    if ("events" in result) {
      consecutiveErrors = 0;
      scheduleEvents(result.events);
    } else {
      console.error("[scheduler] Calendar error:", result.error);
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        clearAllDisplayTimers();
        activeInMeetingEventId = null;
        resolveActiveTitleEvent();
        console.error(
          `[scheduler] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — cleared tray title`,
        );
      }
    }
  } catch (err) {
    console.error("[scheduler] Poll error:", err);
    consecutiveErrors++;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      clearAllDisplayTimers();
      activeInMeetingEventId = null;
      resolveActiveTitleEvent();
      console.error(
        `[scheduler] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — cleared tray title`,
      );
    }
  }
}

/** Start the scheduler — call once from app.whenReady() */
export function startScheduler(): void {
  if (pollInterval) return; // already running

  // Initial poll immediately
  void poll();

  // Then poll every 2 minutes
  pollInterval = setInterval(() => void poll(), POLL_INTERVAL_MS);
  console.log("[scheduler] Started");
}

/** Stop the scheduler and clear all pending timers — call on before-quit */
export function stopScheduler(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  for (const handle of timers.values()) clearTimeout(handle);
  timers.clear();
  scheduledEventData.clear();
  firedEvents.clear();

  for (const handle of titleTimers.values()) clearTimeout(handle);
  titleTimers.clear();

  for (const handle of countdownIntervals.values()) clearInterval(handle);
  countdownIntervals.clear();

  for (const handle of clearTimers.values()) clearTimeout(handle);
  clearTimers.clear();

  for (const handle of inMeetingIntervals.values()) clearInterval(handle);
  inMeetingIntervals.clear();

  for (const handle of inMeetingEndTimers.values()) clearTimeout(handle);
  inMeetingEndTimers.clear();

  activeTitleEventId = null;
  activeInMeetingEventId = null;
  consecutiveErrors = 0;
  updateTrayTitle(null);
  console.log("[scheduler] Stopped");
}

// Export for testing
export {
  activeTitleEventId,
  activeInMeetingEventId,
  consecutiveErrors,
  countdownIntervals,
  firedEvents,
  inMeetingIntervals,
  inMeetingEndTimers,
  poll,
  resolveActiveTitleEvent,
  resolveActiveInMeetingEvent,
  scheduledEventData,
  timers,
};
/** Reset mutable state for tests — not for production use */
export function _resetConsecutiveErrors(): void {
  consecutiveErrors = 0;
}
