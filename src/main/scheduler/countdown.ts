import {
  state,
  setActiveTitleEventId,
  setActiveInMeetingEventId,
  markInMeetingDirty,
} from "./state.js";

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

  // Skip resolution when nothing changed — cached activeTitleEventId is still valid
  if (!state.titleDirty && state.activeTitleEventId !== null) return;


  let bestId: string | null = null;
  let bestStartMs = Infinity;

  for (const id of state.countdownIntervals.keys()) {
    const data = state.scheduledEventData.get(id);
    if (data && data.startMs < bestStartMs) {
      bestStartMs = data.startMs;
      bestId = id;
    }
  }

  state.titleDirty = false;
  setActiveTitleEventId(bestId);

  if (bestId) {
    const data = state.scheduledEventData.get(bestId);
    if (data) {
      const remaining = Math.ceil((data.startMs - Date.now()) / 60_000);
      if (remaining > 0) {
        state.onTrayTitleUpdate?.(data.title, remaining);
      }
    }
  } else {
    state.onTrayTitleUpdate?.(null);
  }
}

/**
 * Determine which in-meeting event should own the tray title.
 * Policy: event ending soonest wins.
 */
export function resolveActiveInMeetingEvent(): void {
  // Skip resolution when nothing changed — cached activeInMeetingEventId is still valid
  if (!state.inMeetingDirty && state.activeInMeetingEventId !== null) return;

  let bestId: string | null = null;
  let bestEndMs = Infinity;

  for (const id of state.inMeetingIntervals.keys()) {
    const data = state.scheduledEventData.get(id);
    if (data && data.endMs < bestEndMs) {
      bestEndMs = data.endMs;
      bestId = id;
    }
  }

  state.inMeetingDirty = false;
  setActiveInMeetingEventId(bestId);

  if (bestId) {
    const data = state.scheduledEventData.get(bestId);
    if (data) {
      const remaining = Math.ceil((data.endMs - Date.now()) / 60_000);
      if (remaining > 0) {
        state.onTrayTitleUpdate?.(data.title, remaining, true);
      }
    }
  } else {
    // No in-meeting event — fall back to pre-meeting
    resolveActiveTitleEvent();
  }
}

/** Start per-minute countdown showing remaining time until meeting ends */
export function startInMeetingCountdown(
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
      state.onTrayTitleUpdate?.(currentData.title, remaining, true);
    }
  }

  // Immediate tick + per-minute interval
  const intervalHandle = setInterval(tickInMeeting, 60_000);
  state.inMeetingIntervals.set(eventId, intervalHandle);

  // Resolve ownership, then do first tick
  markInMeetingDirty();
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
    markInMeetingDirty();
    resolveActiveInMeetingEvent();
    console.log(`[scheduler] Meeting ended: "${data.title}"`);
  }, data.endMs - now);

  state.inMeetingEndTimers.set(eventId, endHandle);
}

/**
 * Clear all display-related timers (countdown and in-meeting).
 * Used when clearing tray title after consecutive errors.
 */
export function clearAllDisplayTimers(): void {
  for (const handle of state.countdownIntervals.values()) clearInterval(handle);
  state.countdownIntervals.clear();
  for (const handle of state.clearTimers.values()) clearTimeout(handle);
  state.clearTimers.clear();
  for (const handle of state.inMeetingIntervals.values()) clearInterval(handle);
  state.inMeetingIntervals.clear();
  for (const handle of state.inMeetingEndTimers.values()) clearTimeout(handle);
  state.inMeetingEndTimers.clear();
}
