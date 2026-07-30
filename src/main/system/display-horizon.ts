/**
 * Wall-clock display horizon timer.
 *
 * Arms a single timeout for the next moment when upcoming-meeting membership
 * or coarse relative labels may change (start/end boundaries). On fire, notifies
 * registered listeners so tray/popover can re-evaluate with Date.now() without
 * requiring calendar content to change.
 *
 * Display-only: never opens browsers, shows alerts, or mutates automation maps.
 */

import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import { nextDisplayHorizonMs } from "../../domain/services/meeting-time.js";

/** Max delay for setTimeout arm (24h). Longer horizons re-arm after fire or list update. */
const MAX_HORIZON_DELAY_MS = 24 * 60 * 60 * 1000;

export type DisplayHorizonListener = () => void;

let timer: ReturnType<typeof setTimeout> | null = null;
let lastEvents: readonly MeetingEvent[] = [];
const listeners = new Set<DisplayHorizonListener>();

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.error("[display-horizon] listener error:", err);
    }
  }
}

function armFromCached(nowMs: number = Date.now()): void {
  clearTimer();
  const nextMs = nextDisplayHorizonMs(lastEvents, nowMs);
  if (nextMs === null) return;

  const delay = Math.min(Math.max(0, nextMs - nowMs), MAX_HORIZON_DELAY_MS);
  timer = setTimeout(() => {
    timer = null;
    notifyListeners();
    // Re-arm for the subsequent boundary (if any).
    armFromCached(Date.now());
  }, delay);
}

/**
 * Replace the event list used for horizon calculation and (re)arm the timer.
 */
export function setDisplayHorizonEvents(
  events: readonly MeetingEvent[],
  nowMs: number = Date.now(),
): void {
  lastEvents = events;
  armFromCached(nowMs);
}

/** Clear timer and forget events (shutdown / tests). */
export function clearDisplayHorizon(): void {
  clearTimer();
  lastEvents = [];
}

/** Register a tick listener. Returns unsubscribe. */
export function onDisplayHorizonTick(listener: DisplayHorizonListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset. */
export function _resetDisplayHorizonForTest(): void {
  clearDisplayHorizon();
  listeners.clear();
}

/** Test/introspection helpers */
export function _getDisplayHorizonListenerCountForTest(): number {
  return listeners.size;
}

export function _hasDisplayHorizonTimerForTest(): boolean {
  return timer !== null;
}
