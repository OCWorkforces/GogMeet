import { Notification, shell } from "electron";
import { getCalendarEventsResult } from "./calendar.js";
import type { MeetingEvent } from "../shared/types.js";
import { updateTrayTitle } from "./tray.js";

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

/** Map of eventId → the startMs that was used when the timer was scheduled */
const scheduledStartMs = new Map<string, number>();

/** Set of eventIds that have already fired (prevents re-fire on refresh) */
const firedEvents = new Set<string>();

/** Active poll interval handle */
let pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Build the URL to open for a meeting.
 * Appends ?authuser=email if we have a Google email for the user.
 */
function buildMeetUrl(event: MeetingEvent): string {
  const base = (event.meetUrl ?? "").startsWith("https://")
    ? event.meetUrl!
    : `https://${event.meetUrl}`;

  const email = event.userEmail?.trim();
  if (email && email.includes("@")) {
    return `${base}?authuser=${encodeURIComponent(email)}`;
  }
  return base;
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
    const openAtMs = startMs - OPEN_BEFORE_MS;
    const delayMs = openAtMs - now;

    // Skip past events and events too far in the future
    if (startMs <= now) continue;
    if (delayMs > MAX_SCHEDULE_AHEAD_MS) continue;

    activeIds.add(event.id);

    // Already fired — skip
    if (firedEvents.has(event.id)) continue;

    // Already scheduled — check if start time changed (reschedule needed)
    if (timers.has(event.id)) {
      const prevStartMs = scheduledStartMs.get(event.id);
      if (prevStartMs === startMs) continue; // same time, timer still valid
      // Start time changed — cancel old timer and reschedule
      clearTimeout(timers.get(event.id)!);
      timers.delete(event.id);
      scheduledStartMs.delete(event.id);
      firedEvents.delete(event.id); // allow re-fire at new time
      console.log(
        `[scheduler] Rescheduled "${event.title}" — start time changed`,
      );
      // fall through to schedule new timer
    }

    const effectiveDelay = Math.max(0, delayMs);

    const handle = setTimeout(() => {
      timers.delete(event.id);
      scheduledStartMs.delete(event.id);
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
    scheduledStartMs.set(event.id, startMs);
    console.log(
      `[scheduler] Scheduled "${event.title}" to open in ${Math.round(effectiveDelay / 1000)}s`,
    );

    // --- 30-min tray title countdown ---
    // Cancel any existing title/countdown/clear timers before (re-)scheduling
    if (titleTimers.has(event.id)) {
      clearTimeout(titleTimers.get(event.id)!);
      titleTimers.delete(event.id);
    }
    if (countdownIntervals.has(event.id)) {
      clearInterval(countdownIntervals.get(event.id)!);
      countdownIntervals.delete(event.id);
    }
    if (clearTimers.has(event.id)) {
      clearTimeout(clearTimers.get(event.id)!);
      clearTimers.delete(event.id);
    }

    /** Compute whole minutes remaining until startMs and update tray */
    function tickCountdown(): void {
      const remaining = Math.ceil((startMs - Date.now()) / 60_000);
      if (remaining > 0) {
        updateTrayTitle(event.title, remaining);
      }
    }

    /** Start per-minute countdown interval and schedule clear at startMs */
    function startCountdown(): void {
      tickCountdown(); // immediate tick so title appears right away
      const intervalHandle = setInterval(() => {
        tickCountdown();
      }, 60_000);
      countdownIntervals.set(event.id, intervalHandle);
      console.log(`[scheduler] Countdown started for "${event.title}"`);

      const clearHandle = setTimeout(
        () => {
          clearInterval(countdownIntervals.get(event.id)!);
          countdownIntervals.delete(event.id);
          clearTimers.delete(event.id);
          updateTrayTitle(null);
          console.log(
            `[scheduler] Tray title cleared (meeting started: "${event.title}")`,
          );
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
  for (const [id, handle] of timers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      timers.delete(id);
      console.log(`[scheduler] Cancelled timer for removed event ${id}`);
    }
  }
  for (const [id, handle] of titleTimers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      titleTimers.delete(id);
    }
  }
  for (const [id, handle] of countdownIntervals) {
    if (!activeIds.has(id)) {
      clearInterval(handle);
      countdownIntervals.delete(id);
    }
  }
  for (const [id, handle] of clearTimers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      clearTimers.delete(id);
    }
  }

  // Prune firedEvents for events no longer in the active list
  for (const id of firedEvents) {
    if (!activeIds.has(id)) {
      firedEvents.delete(id);
    }
  }
}

/** Poll calendar and refresh timers */
async function poll(): Promise<void> {
  try {
    const result = await getCalendarEventsResult();
    if ("events" in result) {
      scheduleEvents(result.events);
    } else {
      console.error("[scheduler] Calendar error:", result.error);
    }
  } catch (err) {
    console.error("[scheduler] Poll error:", err);
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
  scheduledStartMs.clear();
  firedEvents.clear();

  for (const handle of titleTimers.values()) clearTimeout(handle);
  titleTimers.clear();

  for (const handle of countdownIntervals.values()) clearInterval(handle);
  countdownIntervals.clear();

  for (const handle of clearTimers.values()) clearTimeout(handle);
  clearTimers.clear();

  updateTrayTitle(null);
  console.log("[scheduler] Stopped");
}

// Export for testing
export { firedEvents, scheduledStartMs, timers };
