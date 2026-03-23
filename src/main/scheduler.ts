import { Notification, shell } from "electron";
import { getSettings } from "./settings.js";
import { showAlert } from "./alert-window.js";

import { getCalendarEventsResult } from "./calendar.js";
import type { BrowserWindow } from "electron";
import type { MeetingEvent } from "../shared/types.js";
import { IPC_CHANNELS } from "../shared/types.js";
import { updateTrayTitle } from "./tray.js";
import { buildMeetUrl } from "./utils/meet-url.js";

interface ScheduledEventSnapshot {
  title: string;
  meetUrl: string | undefined;
  startMs: number;
  endMs: number;
}

export interface SchedulerState {
  timers: Map<string, ReturnType<typeof setTimeout>>;
  titleTimers: Map<string, ReturnType<typeof setTimeout>>;
  countdownIntervals: Map<string, ReturnType<typeof setInterval>>;
  clearTimers: Map<string, ReturnType<typeof setTimeout>>;
  inMeetingIntervals: Map<string, ReturnType<typeof setInterval>>;
  inMeetingEndTimers: Map<string, ReturnType<typeof setTimeout>>;
  scheduledEventData: Map<string, ScheduledEventSnapshot>;
  firedEvents: Set<string>;
  activeTitleEventId: string | null;
  activeInMeetingEventId: string | null;
  consecutiveErrors: number;
  pollInterval: ReturnType<typeof setInterval> | null;
  win: BrowserWindow | null;
}

export function createSchedulerState(): SchedulerState {
  return {
    timers: new Map<string, ReturnType<typeof setTimeout>>(),
    titleTimers: new Map<string, ReturnType<typeof setTimeout>>(),
    countdownIntervals: new Map<string, ReturnType<typeof setInterval>>(),
    clearTimers: new Map<string, ReturnType<typeof setTimeout>>(),
    inMeetingIntervals: new Map<string, ReturnType<typeof setInterval>>(),
    inMeetingEndTimers: new Map<string, ReturnType<typeof setTimeout>>(),
    scheduledEventData: new Map<string, ScheduledEventSnapshot>(),
    firedEvents: new Set<string>(),
    activeTitleEventId: null,
    activeInMeetingEventId: null,
    consecutiveErrors: 0,
    pollInterval: null,
    win: null,
  };
}

let state = createSchedulerState();

function createMapView<K, V>(getMap: () => Map<K, V>): Map<K, V> {
  return new Proxy({} as Map<K, V>, {
    get(_target, prop) {
      const map = getMap() as unknown as Record<PropertyKey, unknown>;
      const value = map[prop];
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(getMap());
      }
      return value;
    },
  });
}

function createSetView<T>(getSet: () => Set<T>): Set<T> {
  return new Proxy({} as Set<T>, {
    get(_target, prop) {
      const set = getSet() as unknown as Record<PropertyKey, unknown>;
      const value = set[prop];
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(getSet());
      }
      return value;
    },
  });
}

function setActiveTitleEventId(eventId: string | null): void {
  state.activeTitleEventId = eventId;
  activeTitleEventId = eventId;
}

function setActiveInMeetingEventId(eventId: string | null): void {
  state.activeInMeetingEventId = eventId;
  activeInMeetingEventId = eventId;
}

function setConsecutiveErrors(value: number): void {
  state.consecutiveErrors = value;
  consecutiveErrors = value;
}

function incrementConsecutiveErrors(): void {
  setConsecutiveErrors(state.consecutiveErrors + 1);
}

function syncExportedScalars(): void {
  activeTitleEventId = state.activeTitleEventId;
  activeInMeetingEventId = state.activeInMeetingEventId;
  consecutiveErrors = state.consecutiveErrors;
}

function clearSchedulerResources(s: SchedulerState): void {
  if (s.pollInterval) {
    clearInterval(s.pollInterval);
    s.pollInterval = null;
  }

  for (const handle of s.timers.values()) clearTimeout(handle);
  s.timers.clear();

  for (const handle of s.titleTimers.values()) clearTimeout(handle);
  s.titleTimers.clear();

  for (const handle of s.countdownIntervals.values()) clearInterval(handle);
  s.countdownIntervals.clear();

  for (const handle of s.clearTimers.values()) clearTimeout(handle);
  s.clearTimers.clear();

  for (const handle of s.inMeetingIntervals.values()) clearInterval(handle);
  s.inMeetingIntervals.clear();

  for (const handle of s.inMeetingEndTimers.values()) clearTimeout(handle);
  s.inMeetingEndTimers.clear();

  s.scheduledEventData.clear();
  s.firedEvents.clear();
}

function replaceState(nextState: SchedulerState): void {
  state = nextState;
  syncExportedScalars();
}

function resetState(options?: { preserveWindow?: boolean }): void {
  const preserveWindow = options?.preserveWindow ?? false;
  const previousWindow = preserveWindow ? state.win : null;

  clearSchedulerResources(state);

  const nextState = createSchedulerState();
  nextState.win = previousWindow;
  replaceState(nextState);
}

/** Get milliseconds before meeting start to open browser, based on settings */
function getOpenBeforeMs(): number {
  return getSettings().openBeforeMinutes * 60 * 1000;
}

/** How long before meeting start to show the tray title (ms) */
const TITLE_BEFORE_MS = 30 * 60 * 1000; // 30 minutes

/** How often to re-poll calendar events (ms) */
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/** Don't schedule events that start more than this far in the future */
const MAX_SCHEDULE_AHEAD_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Number of consecutive poll errors before force-clearing the tray title (~6 min) */
const MAX_CONSECUTIVE_ERRORS = 3;

/** Map of eventId → active open-browser timer handle */
export const timers = createMapView(() => state.timers);

/** Map of eventId → setTimeout handle that fires when the 30-min window opens */
export const titleTimers = createMapView(() => state.titleTimers);

/** Map of eventId → setInterval handle for the per-minute countdown tick */
export const countdownIntervals = createMapView(() => state.countdownIntervals);

/** Map of eventId → setTimeout handle that fires at meeting start to clear title */
export const clearTimers = createMapView(() => state.clearTimers);

/** Map of eventId → setInterval handle for per-minute in-meeting countdown */
export const inMeetingIntervals = createMapView(() => state.inMeetingIntervals);

/** Map of eventId → setTimeout handle that fires at meeting END */
export const inMeetingEndTimers = createMapView(() => state.inMeetingEndTimers);

/** Map of eventId → stored event snapshot for change detection */
export const scheduledEventData = createMapView(() => state.scheduledEventData);

/** Set of eventIds that have already fired (prevents re-fire on refresh) */
export const firedEvents = createSetView(() => state.firedEvents);

/** Which event currently owns the tray title display (null = no countdown active) */
export let activeTitleEventId: string | null = state.activeTitleEventId;

/** Which event currently owns the in-meeting tray title */
export let activeInMeetingEventId: string | null = state.activeInMeetingEventId;

/** Counter of consecutive calendar fetch errors — reset to 0 on success */
export let consecutiveErrors = state.consecutiveErrors;

export function setSchedulerWindow(w: BrowserWindow): void {
  state.win = w;
}

/**
 * Clear all display-related timers (countdown and in-meeting).
 * Used when clearing tray title after consecutive errors.
 */
function clearAllDisplayTimers(): void {
  for (const handle of state.countdownIntervals.values()) clearInterval(handle);
  state.countdownIntervals.clear();
  for (const handle of state.clearTimers.values()) clearTimeout(handle);
  state.clearTimers.clear();
  for (const handle of state.inMeetingIntervals.values()) clearInterval(handle);
  state.inMeetingIntervals.clear();
  for (const handle of state.inMeetingEndTimers.values()) clearTimeout(handle);
  state.inMeetingEndTimers.clear();
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
export function resolveActiveTitleEvent(): void {
  // In-meeting events take priority — don't overwrite
  if (
    state.activeInMeetingEventId &&
    state.inMeetingIntervals.has(state.activeInMeetingEventId)
  ) {
    return;
  }

  let bestId: string | null = null;
  let bestStartMs = Infinity;

  for (const id of state.countdownIntervals.keys()) {
    const data = state.scheduledEventData.get(id);
    if (data && data.startMs < bestStartMs) {
      bestStartMs = data.startMs;
      bestId = id;
    }
  }

  setActiveTitleEventId(bestId);

  if (bestId) {
    const data = state.scheduledEventData.get(bestId);
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
export function resolveActiveInMeetingEvent(): void {
  let bestId: string | null = null;
  let bestEndMs = Infinity;

  for (const id of state.inMeetingIntervals.keys()) {
    const data = state.scheduledEventData.get(id);
    if (data && data.endMs < bestEndMs) {
      bestEndMs = data.endMs;
      bestId = id;
    }
  }

  setActiveInMeetingEventId(bestId);

  if (bestId) {
    const data = state.scheduledEventData.get(bestId);
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
    if (eventId !== state.activeInMeetingEventId) return;
    const currentData = state.scheduledEventData.get(eventId);
    if (!currentData) return;
    const remaining = Math.ceil((currentData.endMs - Date.now()) / 60_000);
    if (remaining > 0) {
      updateTrayTitle(currentData.title, remaining, true);
    }
  }

  // Immediate tick + per-minute interval
  const intervalHandle = setInterval(tickInMeeting, 60_000);
  state.inMeetingIntervals.set(eventId, intervalHandle);

  // Resolve ownership, then do first tick
  resolveActiveInMeetingEvent();

  console.log(`[scheduler] In-meeting countdown started for "${data.title}"`);

  // Set timer to clear at meeting end
  const endHandle = setTimeout(() => {
    const interval = state.inMeetingIntervals.get(eventId);
    if (interval) {
      clearInterval(interval);
    }
    state.inMeetingIntervals.delete(eventId);
    state.inMeetingEndTimers.delete(eventId);
    state.scheduledEventData.delete(eventId);
    if (state.activeInMeetingEventId === eventId) {
      setActiveInMeetingEventId(null);
    }
    resolveActiveInMeetingEvent();
    console.log(`[scheduler] Meeting ended: "${data.title}"`);
  }, data.endMs - now);

  state.inMeetingEndTimers.set(eventId, endHandle);
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
    const openAtMs = startMs - getOpenBeforeMs();
    const delayMs = openAtMs - now;

    // Handle already-in-progress events
    if (startMs <= now) {
      // Check if meeting is currently in progress
      if (endMs > now) {
        // Meeting in progress — start in-meeting countdown
        activeIds.add(event.id);
        if (!state.inMeetingIntervals.has(event.id)) {
          state.scheduledEventData.set(event.id, {
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
    if (state.firedEvents.has(event.id)) continue;

    // Already scheduled — check what changed
    if (state.timers.has(event.id)) {
      const prevData = state.scheduledEventData.get(event.id);
      if (prevData) {
        const timeChanged = prevData.startMs !== startMs;
        const titleChanged = prevData.title !== event.title;
        const urlChanged = prevData.meetUrl !== event.meetUrl;

        if (!timeChanged && !titleChanged && !urlChanged) continue; // nothing changed

        if (!timeChanged) {
          // Only metadata changed — update snapshot and refresh in-place (no timer reschedule)
          state.scheduledEventData.set(event.id, {
            title: event.title,
            meetUrl: event.meetUrl,
            startMs,
            endMs,
          });

          if (urlChanged) {
            // Reschedule the browser-open timer with the new URL
            const existingTimer = state.timers.get(event.id);
            if (existingTimer) {
              clearTimeout(existingTimer);
            }
            state.timers.delete(event.id);
            // fall through below to schedule new browser timer (same start time)
            console.log(
              `[scheduler] URL changed for "${event.title}" — rescheduling browser open`,
            );
          } else {
            // Title-only change — update tray immediately if this event owns the title
            if (state.activeTitleEventId === event.id) {
              const remaining = Math.ceil((startMs - Date.now()) / 60_000);
              if (remaining > 0) updateTrayTitle(event.title, remaining);
            }
            console.log(`[scheduler] Title updated for "${event.title}"`);
            continue; // no timer changes needed
          }
        } else {
          // Start time changed — cancel all timers and fully reschedule
          const existingTimer = state.timers.get(event.id);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }
          state.timers.delete(event.id);
          state.scheduledEventData.delete(event.id);
          state.firedEvents.delete(event.id); // allow re-fire at new time
          console.log(
            `[scheduler] Rescheduled "${event.title}" — start time changed`,
          );
          // fall through to schedule new timer
        }
      }
    }

    const effectiveDelay = Math.max(0, delayMs);

    const handle = setTimeout(() => {
      state.timers.delete(event.id);
      state.scheduledEventData.delete(event.id);
      state.firedEvents.add(event.id);
      // Always show notification for all meetings
      new Notification({
        title: event.title,
        body: "Starting now",
      }).show();
      // Show window alert if enabled — suppress auto-open when alert handles it
      let alertShown = false;
      try {
        const settings = getSettings();
        if (settings.windowAlert) {
          showAlert(event);
          alertShown = true;
        }
      } catch {
        // Non-critical — alert is optional UX
      }
      // Only open browser for meetings with a URL
      // Skip auto-open when window alert is shown (user joins via alert button)
      if (!event.meetUrl) {
        console.log(
          `[scheduler] Notification shown for "${event.title}" (no URL)`,
        );
        return;
      }
      if (alertShown) {
        console.log(`[scheduler] Alert shown for "${event.title}" — skipping auto-open`);
        return;
      }
      const url = buildMeetUrl(event);
      shell.openExternal(url).catch((err) => {
        console.error(`[scheduler] Failed to open ${url}:`, err);
      });
      console.log(`[scheduler] Opened browser for "${event.title}" → ${url}`);
    }, effectiveDelay);

    state.timers.set(event.id, handle);
    state.scheduledEventData.set(event.id, {
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
    const existingTitleTimer = state.titleTimers.get(event.id);
    if (existingTitleTimer) {
      clearTimeout(existingTitleTimer);
      state.titleTimers.delete(event.id);
    }
    const existingCountdown = state.countdownIntervals.get(event.id);
    if (existingCountdown) {
      clearInterval(existingCountdown);
      state.countdownIntervals.delete(event.id);
    }
    const existingClearTimer = state.clearTimers.get(event.id);
    if (existingClearTimer) {
      clearTimeout(existingClearTimer);
      state.clearTimers.delete(event.id);
    }

    /** Compute whole minutes remaining until startMs and update tray */
    function tickCountdown(): void {
      // Only update tray if this event currently owns the title
      if (event.id !== state.activeTitleEventId) return;
      const data = state.scheduledEventData.get(event.id);
      if (!data) return;
      const remaining = Math.ceil((data.startMs - Date.now()) / 60_000);
      if (remaining > 0) {
        updateTrayTitle(data.title, remaining);
      }
    }

    /** Start per-minute countdown interval and schedule clear at startMs */
    function startCountdown(): void {
      // Guard: bail if event was deleted between titleTimer fire and now
      if (!state.scheduledEventData.has(event.id)) return;

      tickCountdown(); // immediate tick so title appears right away — sets ownership via resolveActiveTitleEvent below
      const intervalHandle = setInterval(() => {
        tickCountdown();
      }, 60_000);
      state.countdownIntervals.set(event.id, intervalHandle);
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
        state.titleTimers.delete(event.id);
        startCountdown();
      }, titleDelayMs);
      state.titleTimers.set(event.id, titleHandle);
      console.log(
        `[scheduler] Title timer set for "${event.title}" in ${Math.round(titleDelayMs / 1000)}s`,
      );
    } else if (startMs > now) {
      // Already inside the 30-min window — start countdown immediately
      startCountdown();
    }
  }

  // Cancel timers for events that are no longer in the list (e.g. cancelled meetings)
  cleanupStaleEntries(state.timers, activeIds, (h) => {
    clearTimeout(h);
    console.log("[scheduler] Cancelled timer for removed event");
  });
  cleanupStaleEntries(state.titleTimers, activeIds, (h) => clearTimeout(h));
  cleanupStaleEntries(state.countdownIntervals, activeIds, (h) =>
    clearInterval(h),
  );
  cleanupStaleEntries(state.clearTimers, activeIds, (h) => clearTimeout(h));
  // Cleanup stale in-meeting timers
  cleanupStaleEntries(state.inMeetingIntervals, activeIds, (h) =>
    clearInterval(h),
  );
  cleanupStaleEntries(state.inMeetingEndTimers, activeIds, (h) =>
    clearTimeout(h),
  );

  // Prune firedEvents and scheduledEventData for events no longer in the active list
  for (const id of state.firedEvents) {
    if (!activeIds.has(id)) {
      state.firedEvents.delete(id);
    }
  }
  for (const id of state.scheduledEventData.keys()) {
    if (!activeIds.has(id)) {
      state.scheduledEventData.delete(id);
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
  if (state.pollInterval) return; // already running

  // Initial poll immediately
  void poll();

  // Then poll every 2 minutes
  state.pollInterval = setInterval(() => void poll(), POLL_INTERVAL_MS);
  console.log("[scheduler] Started");
}

/** Stop the scheduler and clear all pending timers — call on before-quit */
export function stopScheduler(): void {
  resetState({ preserveWindow: true });
  updateTrayTitle(null);
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
