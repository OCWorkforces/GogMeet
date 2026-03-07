import { shell } from "electron";
import { getCalendarEvents } from "./calendar.js";
import type { MeetingEvent } from "../shared/types.js";

/** How long before meeting start to open the browser (ms) */
const OPEN_BEFORE_MS = 60 * 1000; // 1 minute

/** How often to re-poll calendar events (ms) */
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/** Don't schedule events that start more than this far in the future */
const MAX_SCHEDULE_AHEAD_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Map of eventId → active timer handle */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Set of eventIds that have already fired (prevents re-fire on refresh) */
const firedEvents = new Set<string>();

/** Active poll interval handle */
let pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Build the URL to open for a meeting.
 * Appends ?authuser=email if we have a Google email for the user.
 */
function buildMeetUrl(event: MeetingEvent): string {
  const base = (event.meetUrl ?? '').startsWith('https://')
    ? event.meetUrl!
    : `https://${event.meetUrl}`;

  const email = event.userEmail?.trim();
  if (email && email.includes('@')) {
    return `${base}?authuser=${encodeURIComponent(email)}`;
  }
  return base;
}

/**
 * Schedule or re-schedule browser-open timers for the given events.
 * Safe to call multiple times — clears stale timers for removed events.
 */
function scheduleEvents(events: MeetingEvent[]): void {
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

    // Already scheduled — skip (timer still valid)
    if (timers.has(event.id)) continue;

    const effectiveDelay = Math.max(0, delayMs);

    const handle = setTimeout(() => {
      timers.delete(event.id);
      firedEvents.add(event.id);
      if (!event.meetUrl) return; // no URL — nothing to open
      const url = buildMeetUrl(event);
      shell.openExternal(url).catch((err) => {
        console.error(`[scheduler] Failed to open ${url}:`, err);
      });
      console.log(`[scheduler] Opened browser for "${event.title}" → ${url}`);
    }, effectiveDelay);

    timers.set(event.id, handle);
    console.log(
      `[scheduler] Scheduled "${event.title}" to open in ${Math.round(effectiveDelay / 1000)}s`,
    );
  }

  // Cancel timers for events that are no longer in the list (e.g. cancelled meetings)
  for (const [id, handle] of timers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      timers.delete(id);
      console.log(`[scheduler] Cancelled timer for removed event ${id}`);
    }
  }
}

/** Poll calendar and refresh timers */
async function poll(): Promise<void> {
  try {
    const events = await getCalendarEvents();
    scheduleEvents(events);
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

  for (const handle of timers.values()) {
    clearTimeout(handle);
  }
  timers.clear();

  console.log("[scheduler] Stopped");
}
