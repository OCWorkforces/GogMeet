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
  activeTitleEventId: string | null;
  activeInMeetingEventId: string | null;
  titleDirty: boolean;
  inMeetingDirty: boolean;
  consecutiveErrors: number;
  pollTimeout: ReturnType<typeof setTimeout> | null;
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
    activeTitleEventId: null,
    activeInMeetingEventId: null,
    titleDirty: false,
    inMeetingDirty: false,
    consecutiveErrors: 0,
    pollTimeout: null,
    win: null,
    onTrayTitleUpdate: null,
    powerCallbacks: null,
  };
}

export let state = createSchedulerState();

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

export function setActiveTitleEventId(eventId: string | null): void {
  state.activeTitleEventId = eventId;
  activeTitleEventId = eventId;
}

export function setActiveInMeetingEventId(eventId: string | null): void {
  state.activeInMeetingEventId = eventId;
  activeInMeetingEventId = eventId;
}

export function setConsecutiveErrors(value: number): void {
  state.consecutiveErrors = value;
  consecutiveErrors = value;
}

export function markTitleDirty(): void {
  state.titleDirty = true;
  titleDirty = true;
}

export function markInMeetingDirty(): void {
  state.inMeetingDirty = true;
  inMeetingDirty = true;
}

export function incrementConsecutiveErrors(): void {
  setConsecutiveErrors(state.consecutiveErrors + 1);
}

export function syncExportedScalars(): void {
  activeTitleEventId = state.activeTitleEventId;
  activeInMeetingEventId = state.activeInMeetingEventId;
  consecutiveErrors = state.consecutiveErrors;
  titleDirty = state.titleDirty;
  inMeetingDirty = state.inMeetingDirty;
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
      console.log("[scheduler] Cancelled timer for removed event");
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
      console.log("[scheduler] Cancelled alert timer for removed event");
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
  state = nextState;
  syncExportedScalars();
}

export function resetState(options?: { preserveWindow?: boolean }): void {
  const preserveWindow = options?.preserveWindow ?? false;
  const previousWindow = preserveWindow ? state.win : null;
  const previousCallback = state.onTrayTitleUpdate;
  const previousPowerCallbacks = state.powerCallbacks;

  clearSchedulerResources(state);

  const nextState = createSchedulerState();
  nextState.win = previousWindow;
  nextState.onTrayTitleUpdate = previousCallback ?? null;
  nextState.powerCallbacks = previousPowerCallbacks ?? null;
  replaceState(nextState);
}

/** Map of eventId → active open-browser timer handle */
export const timers = createMapView(() => state.timers);

/** Map of eventId → alert window timer handle (fires 1 min before browser timer) */
export const alertTimers = createMapView(() => state.alertTimers);

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

/** Set of eventIds that have already shown an alert (prevents re-show on refresh) */
export const alertFiredEvents = createSetView(() => state.alertFiredEvents);

/** Which event currently owns the tray title display (null = no countdown active) */
export let activeTitleEventId: string | null = state.activeTitleEventId;

/** Which event currently owns the in-meeting tray title */
export let activeInMeetingEventId: string | null = state.activeInMeetingEventId;

/** Counter of consecutive calendar fetch errors — reset to 0 on success */
export let consecutiveErrors = state.consecutiveErrors;

/** Whether the title resolution needs to re-resolve (countdown set changed) */
export let titleDirty = state.titleDirty;

/** Whether the in-meeting resolution needs to re-resolve (in-meeting set changed) */
export let inMeetingDirty = state.inMeetingDirty;
