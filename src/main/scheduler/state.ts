import type { BrowserWindow } from "electron";

export interface ScheduledEventSnapshot {
  title: string;
  meetUrl: string | undefined;
  startMs: number;
  endMs: number;
}

export interface SchedulerState {
  timers: Map<string, ReturnType<typeof setTimeout>>;
  alertTimers: Map<string, ReturnType<typeof setTimeout>>;
  titleTimers: Map<string, ReturnType<typeof setTimeout>>;
  countdownIntervals: Map<string, ReturnType<typeof setInterval>>;
  clearTimers: Map<string, ReturnType<typeof setTimeout>>;
  inMeetingIntervals: Map<string, ReturnType<typeof setInterval>>;
  inMeetingEndTimers: Map<string, ReturnType<typeof setTimeout>>;
  scheduledEventData: Map<string, ScheduledEventSnapshot>;
  firedEvents: Set<string>;
  alertFiredEvents: Set<string>;
  /** Tracks events whose countdown has been cancelled to prevent clearHandle/cancel races */
  cancelledEvents: Set<string>;
  activeTitleEventId: string | null;
  activeInMeetingEventId: string | null;
  titleDirty: boolean;
  inMeetingDirty: boolean;
  consecutiveErrors: number;
  pollTimeout: ReturnType<typeof setTimeout> | null;
  pollEpoch: number;
  win: BrowserWindow | null;
  onTrayTitleUpdate?:
    | ((
        title: string | null,
        minsRemaining?: number,
        inMeeting?: boolean,
      ) => void)
    | null;
  powerCallbacks?: PowerCallbacks | null;
}

export interface PowerCallbacks {
  getPollInterval: () => number;
  preventSleep: () => void;
  allowSleep: () => void;
}

export function createSchedulerState(): SchedulerState {
  return {
    timers: new Map<string, ReturnType<typeof setTimeout>>(),
    alertTimers: new Map<string, ReturnType<typeof setTimeout>>(),
    titleTimers: new Map<string, ReturnType<typeof setTimeout>>(),
    countdownIntervals: new Map<string, ReturnType<typeof setInterval>>(),
    clearTimers: new Map<string, ReturnType<typeof setTimeout>>(),
    inMeetingIntervals: new Map<string, ReturnType<typeof setInterval>>(),
    inMeetingEndTimers: new Map<string, ReturnType<typeof setTimeout>>(),
    scheduledEventData: new Map<string, ScheduledEventSnapshot>(),
    firedEvents: new Set<string>(),
    alertFiredEvents: new Set<string>(),
    cancelledEvents: new Set<string>(),
    activeTitleEventId: null,
    activeInMeetingEventId: null,
    titleDirty: false,
    inMeetingDirty: false,
    consecutiveErrors: 0,
    pollTimeout: null,
    pollEpoch: 0,
    win: null,
    onTrayTitleUpdate: null,
    powerCallbacks: null,
  };
}

export let state = createSchedulerState();


export function setActiveTitleEventId(eventId: string | null): void {
  state.activeTitleEventId = eventId;
}

export function setActiveInMeetingEventId(eventId: string | null): void {
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

/** Cap to prevent unbounded growth after error handler has already fired */
const MAX_CONSECUTIVE_ERRORS_CAP = 4;

export function incrementConsecutiveErrors(): void {
  const next = state.consecutiveErrors + 1;
  setConsecutiveErrors(Math.min(next, MAX_CONSECUTIVE_ERRORS_CAP));
}


export function initPowerCallbacks(callbacks: PowerCallbacks): void {
  state.powerCallbacks = callbacks;
}

export function clearSchedulerResources(s: SchedulerState): void {
  if (s.pollTimeout !== null) {
    clearTimeout(s.pollTimeout);
    s.pollTimeout = null;
  }

  for (const handle of s.timers.values()) clearTimeout(handle);
  s.timers.clear();

  for (const handle of s.alertTimers.values()) clearTimeout(handle);
  s.alertTimers.clear();

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
  s.alertFiredEvents.clear();
  s.cancelledEvents.clear();
}

/**
 * Cancel and remove entries from all timer Maps/Sets that are NOT in activeIds.
 * This consolidates the per-map cleanup loops from scheduleEvents().
 * @param onCountdownCancelled - optional callback invoked when a countdownInterval is cancelled
 *                                (e.g. to allow the system to resume sleep)
 */
export function cancelStaleEntries(
  s: SchedulerState,
  activeIds: Set<string>,
  callbacks?: {
    onBrowserCancel?: (id: string, timers: Map<string, ReturnType<typeof setTimeout>>) => void;
    onAlertCancel?: (id: string, alertTimers: Map<string, ReturnType<typeof setTimeout>>) => void;
    onCountdownIntervalCancel?: () => void;
  },
): void {
  // Browser timers
  for (const id of s.timers.keys()) {
    if (!activeIds.has(id)) {
      if (callbacks?.onBrowserCancel) {
        callbacks.onBrowserCancel(id, s.timers);
      } else {
        clearTimeout(s.timers.get(id)!);
        s.timers.delete(id);
      }
      console.debug("[scheduler] Cancelled timer for removed event");
    }
  }
  // Alert timers
  for (const [id] of s.alertTimers) {
    if (!activeIds.has(id)) {
      if (callbacks?.onAlertCancel) {
        callbacks.onAlertCancel(id, s.alertTimers);
      } else {
        clearTimeout(s.alertTimers.get(id)!);
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
  for (const id of s.firedEvents) {
    if (!activeIds.has(id)) {
      s.firedEvents.delete(id);
    }
  }
  for (const id of s.alertFiredEvents) {
    if (!activeIds.has(id)) {
      s.alertFiredEvents.delete(id);
    }
  }
  // Prune event data
  for (const id of s.scheduledEventData.keys()) {
    if (!activeIds.has(id)) {
      s.scheduledEventData.delete(id);
    }
  }
}

export function replaceState(nextState: SchedulerState): void {
// Clear old timer handles to prevent stale callbacks
  clearSchedulerResources(state);
  // Preserve critical refs that should survive state replacement
  nextState.win = state.win;
  nextState.onTrayTitleUpdate = state.onTrayTitleUpdate ?? null;
  nextState.powerCallbacks = state.powerCallbacks ?? null;
state = nextState;
}

export function resetState(options?: { preserveWindow?: boolean }): void {
  const preserveWindow = options?.preserveWindow ?? false;
  const previousWindow = preserveWindow ? state.win : null;
  const previousCallback = state.onTrayTitleUpdate;
  const previousPowerCallbacks = state.powerCallbacks;

  clearSchedulerResources(state);

  const nextState = createSchedulerState();
  replaceState(nextState);
  // Override preserved refs with explicit values (resetState semantics)
  state.win = previousWindow;
  state.onTrayTitleUpdate = previousCallback ?? null;
  state.powerCallbacks = previousPowerCallbacks ?? null;
}



// ---------------------------------------------------------------------------
// Typed getter functions — preferred API for internal scheduler consumers.
// These return the live underlying Maps/Sets (mutable) and always reflect the
// current state object even after resetState() / replaceState() swaps it.
// ---------------------------------------------------------------------------

export function getTimers(): Map<string, ReturnType<typeof setTimeout>> {
  return state.timers;
}

export function getAlertTimers(): Map<string, ReturnType<typeof setTimeout>> {
  return state.alertTimers;
}

export function getTitleTimers(): Map<string, ReturnType<typeof setTimeout>> {
  return state.titleTimers;
}

export function getCountdownIntervals(): Map<string, ReturnType<typeof setInterval>> {
  return state.countdownIntervals;
}

export function getClearTimers(): Map<string, ReturnType<typeof setTimeout>> {
  return state.clearTimers;
}

export function getInMeetingIntervals(): Map<string, ReturnType<typeof setInterval>> {
  return state.inMeetingIntervals;
}

export function getInMeetingEndTimers(): Map<string, ReturnType<typeof setTimeout>> {
  return state.inMeetingEndTimers;
}

export function getScheduledEventData(): Map<string, ScheduledEventSnapshot> {
  return state.scheduledEventData;
}

export function getFiredEvents(): Set<string> {
  return state.firedEvents;
}

export function getAlertFiredEvents(): Set<string> {
  return state.alertFiredEvents;
}

export function getActiveTitleEventId(): string | null {
  return state.activeTitleEventId;
}

export function getActiveInMeetingEventId(): string | null {
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
