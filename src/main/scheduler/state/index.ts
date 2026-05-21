import type { EventId } from "../../../shared/brand.js";
import {
  type ScheduledEventSnapshot,
  type TimersState,
  clearAllTimers,
  clearTimerHandles,
  createTimersState,
} from "./state-timers.js";
import { type DisplayState, createDisplayState } from "./state-display.js";
import { MAX_CONSECUTIVE_ERRORS_CAP, type PollState, createPollState } from "./state-poll.js";
import { type RuntimeState, createRuntimeState } from "./state-runtime.js";

export type { ScheduledEventSnapshot } from "./state-timers.js";
export type { PowerCallbacks } from "./state-runtime.js";

export interface SchedulerState extends TimersState, DisplayState, PollState, RuntimeState {}

export function createSchedulerState(): SchedulerState {
  return {
    ...createTimersState(),
    ...createDisplayState(),
    ...createPollState(),
    ...createRuntimeState(),
  };
}

export let state: SchedulerState = createSchedulerState();

export function setActiveTitleEventId(eventId: EventId | null): void {
  state.activeTitleEventId = eventId;
}

export function setActiveInMeetingEventId(eventId: EventId | null): void {
  state.activeInMeetingEventId = eventId;
}

export function setConsecutiveErrors(value: number): void {
  state.consecutiveErrors = value;
}

export function markTitleDirty(): void {
  state.titleDirty = true;
}

export function markInMeetingDirty(): void {
  state.inMeetingDirty = true;
}

export function incrementConsecutiveErrors(): void {
  const next = state.consecutiveErrors + 1;
  setConsecutiveErrors(Math.min(next, MAX_CONSECUTIVE_ERRORS_CAP));
}

export function clearSchedulerResources(
  s: SchedulerState,
  options?: { preserveFiredState?: boolean },
): void {
  if (s.pollTimeout !== null) {
    clearTimeout(s.pollTimeout);
    s.pollTimeout = null;
  }

  if (options?.preserveFiredState === true) {
    clearTimerHandles(s);
  } else {
    clearAllTimers(s);
  }

  s.lastKnownEvents = null;
}

/**
 * Cancel and remove entries from all timer Maps/Sets that are NOT in activeIds.
 * This consolidates the per-map cleanup loops from scheduleEvents().
 * @param onCountdownCancelled - optional callback invoked when a countdownInterval is cancelled
 *                                (e.g. to allow the system to resume sleep)
 */
export function cancelStaleEntries(
  s: SchedulerState,
  activeIds: Set<EventId>,
  callbacks?: {
    onBrowserCancel?: (id: EventId, timers: Map<EventId, ReturnType<typeof setTimeout>>) => void;
    onAlertCancel?: (id: EventId, alertTimers: Map<EventId, ReturnType<typeof setTimeout>>) => void;
    onCountdownIntervalCancel?: () => void;
    onPruneCancelledEvents?: (activeIds: Set<EventId>) => void;
  },
): void {
  // Browser timers
  for (const [id, handle] of s.timers) {
    if (!activeIds.has(id)) {
      if (callbacks?.onBrowserCancel) {
        callbacks.onBrowserCancel(id, s.timers);
      } else {
        clearTimeout(handle);
        s.timers.delete(id);
      }
      console.debug("[scheduler] Cancelled timer for removed event");
    }
  }
  // Alert timers
  for (const [id, handle] of s.alertTimers) {
    if (!activeIds.has(id)) {
      if (callbacks?.onAlertCancel) {
        callbacks.onAlertCancel(id, s.alertTimers);
      } else {
        clearTimeout(handle);
        s.alertTimers.delete(id);
      }
      console.debug("[scheduler] Cancelled alert timer for removed event");
    }
  }
  // Title timers
  for (const [id, handle] of s.titleTimers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      s.titleTimers.delete(id);
    }
  }
  // Countdown intervals
  for (const [id, handle] of s.countdownIntervals) {
    if (!activeIds.has(id)) {
      clearInterval(handle);
      callbacks?.onCountdownIntervalCancel?.();
      s.countdownIntervals.delete(id);
    }
  }
  // Clear timers
  for (const [id, handle] of s.clearTimers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      s.clearTimers.delete(id);
    }
  }
  // In-meeting intervals
  for (const [id, handle] of s.inMeetingIntervals) {
    if (!activeIds.has(id)) {
      clearInterval(handle);
      s.inMeetingIntervals.delete(id);
    }
  }
  // In-meeting end timers
  for (const [id, handle] of s.inMeetingEndTimers) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      s.inMeetingEndTimers.delete(id);
    }
  }
  // Prune Sets
  const nowMs = Date.now();
  for (const [id, expiresAt] of s.firedEvents) {
    if (!activeIds.has(id) && expiresAt < nowMs) {
      s.firedEvents.delete(id);
    }
  }
  for (const [id, expiresAt] of s.alertFiredEvents) {
    if (!activeIds.has(id) && expiresAt < nowMs) {
      s.alertFiredEvents.delete(id);
    }
  }
  // Prune cancelledEvents Set (delegated to title-countdown owner)
  callbacks?.onPruneCancelledEvents?.(activeIds);
  // Prune event data
  for (const id of s.scheduledEventData.keys()) {
    if (!activeIds.has(id)) {
      s.scheduledEventData.delete(id);
    }
  }
}

export function replaceState(
  nextState: SchedulerState,
  options?: { preserveFiredState?: boolean },
): void {
  // Snapshot critical refs BEFORE clearing — clearSchedulerResources() nulls
  // lastKnownEvents, so we must read it (and the runtime callbacks) first.
  const previousWin = state.win;
  const previousCallback = state.onTrayTitleUpdate ?? null;
  const previousPowerCallbacks = state.powerCallbacks ?? null;
  const previousLastKnownEvents = state.lastKnownEvents;
  // Snapshot suppression Maps/Set before clearing if asked to preserve them
  const preserveFiredState = options?.preserveFiredState === true;
  const previousFiredEvents = preserveFiredState
    ? new Map<EventId, number>(state.firedEvents)
    : null;
  const previousAlertFiredEvents = preserveFiredState
    ? new Map<EventId, number>(state.alertFiredEvents)
    : null;
  const previousCancelledEvents = preserveFiredState
    ? new Set<EventId>(state.cancelledEvents)
    : null;
  // Clear old timer handles to prevent stale callbacks
  clearSchedulerResources(state, { preserveFiredState });
  // Restore preserved refs onto the replacement state
  nextState.win = previousWin;
  nextState.onTrayTitleUpdate = previousCallback;
  nextState.powerCallbacks = previousPowerCallbacks;
  nextState.lastKnownEvents = previousLastKnownEvents;
  if (previousFiredEvents !== null) {
    nextState.firedEvents = previousFiredEvents;
  }
  if (previousAlertFiredEvents !== null) {
    nextState.alertFiredEvents = previousAlertFiredEvents;
  }
  if (previousCancelledEvents !== null) {
    nextState.cancelledEvents = previousCancelledEvents;
  }
  state = nextState;
}

export function resetState(options?: {
  preserveWindow?: boolean;
  preserveFiredState?: boolean;
}): void {
  const preserveWindow = options?.preserveWindow ?? false;
  const preserveFiredState = options?.preserveFiredState ?? false;
  const previousWindow = preserveWindow ? state.win : null;
  const previousCallback = state.onTrayTitleUpdate;
  const previousPowerCallbacks = state.powerCallbacks;

  // Snapshot suppression state if requested — clearSchedulerResources will wipe it
  const previousFiredEvents = preserveFiredState
    ? new Map<EventId, number>(state.firedEvents)
    : null;
  const previousAlertFiredEvents = preserveFiredState
    ? new Map<EventId, number>(state.alertFiredEvents)
    : null;
  const previousCancelledEvents = preserveFiredState
    ? new Set<EventId>(state.cancelledEvents)
    : null;

  clearSchedulerResources(state, { preserveFiredState });

  const nextState = createSchedulerState();
  replaceState(nextState);
  // Override preserved refs with explicit values (resetState semantics)
  state.win = previousWindow;
  state.onTrayTitleUpdate = previousCallback ?? null;
  state.powerCallbacks = previousPowerCallbacks ?? null;
  if (previousFiredEvents !== null) {
    state.firedEvents = previousFiredEvents;
  }
  if (previousAlertFiredEvents !== null) {
    state.alertFiredEvents = previousAlertFiredEvents;
  }
  if (previousCancelledEvents !== null) {
    state.cancelledEvents = previousCancelledEvents;
  }
}

// ---------------------------------------------------------------------------
// Typed getter functions — preferred API for internal scheduler consumers.
// These return the live underlying Maps/Sets (mutable) and always reflect the
// current state object even after resetState() / replaceState() swaps it.
// ---------------------------------------------------------------------------

export function getTimers(): ReadonlyMap<EventId, ReturnType<typeof setTimeout>> {
  return state.timers;
}

export function getAlertTimers(): ReadonlyMap<EventId, ReturnType<typeof setTimeout>> {
  return state.alertTimers;
}

export function getTitleTimers(): ReadonlyMap<EventId, ReturnType<typeof setTimeout>> {
  return state.titleTimers;
}

export function getCountdownIntervals(): ReadonlyMap<EventId, ReturnType<typeof setInterval>> {
  return state.countdownIntervals;
}

export function getClearTimers(): ReadonlyMap<EventId, ReturnType<typeof setTimeout>> {
  return state.clearTimers;
}

export function getInMeetingIntervals(): ReadonlyMap<EventId, ReturnType<typeof setInterval>> {
  return state.inMeetingIntervals;
}

export function getInMeetingEndTimers(): ReadonlyMap<EventId, ReturnType<typeof setTimeout>> {
  return state.inMeetingEndTimers;
}

export function getScheduledEventData(): ReadonlyMap<EventId, ScheduledEventSnapshot> {
  return state.scheduledEventData;
}

export function getFiredEvents(): ReadonlyMap<EventId, number> {
  return state.firedEvents;
}

export function getAlertFiredEvents(): ReadonlyMap<EventId, number> {
  return state.alertFiredEvents;
}

export function getActiveTitleEventId(): EventId | null {
  return state.activeTitleEventId;
}

export function getActiveInMeetingEventId(): EventId | null {
  return state.activeInMeetingEventId;
}

export function getConsecutiveErrors(): number {
  return state.consecutiveErrors;
}

export function isTitleDirty(): boolean {
  return state.titleDirty;
}

export function isInMeetingDirty(): boolean {
  return state.inMeetingDirty;
}
