// scheduler/facade.ts — single public entry point for external consumers.
// Function bodies live here so external imports are 1-hop. Internal scheduler
// files (poll.ts, index.ts, state.ts, countdown.ts) MUST NOT import from this
// module to avoid cycles — they cross-import each other directly instead.

import type { BrowserWindow } from "electron";
import type { CalendarResult } from "../../domain/entities/calendar-result.js";
import type { CalendarPublication } from "../../domain/entities/calendar-publication.js";
import { state, resetState, type PowerCallbacks } from "./state/index.js";
import { poll } from "./poll.js";
import { cancelBrowserTimer } from "./browser-timer.js";
import type { EventId } from "../../domain/entities/brand.js";
import { FIRED_EVENT_TTL_MS } from "./state/state-timers.js";
import { cancelCalendarRefresh } from "../calendar/refresh-coordinator.js";

/** Minimum ms between force-polls — prevents thrash from rapid tray clicks or wake storms */
const FORCE_POLL_COALESCE_MS = 10_000;

/** Timestamp of the last completed poll (used by forcePoll coalesce guard) */
let lastPollCompletedAt = 0;

/** Pending deferred forcePoll timer scheduled when a forcePoll is coalesced */
let pendingForcePollTimer: ReturnType<typeof setTimeout> | null = null;

/** In-flight poll guard — set while a guarded poll() is awaiting completion */
let inFlightPoll: Promise<CalendarPublication | null> | null = null;

/** Set when a guarded poll is requested while one is already in flight — bounded to one */
let queuedPollRequested = false;

/** Monotonic lifecycle generation; never reset so stopped schedulers cannot collide by epoch reuse */
let lifecycleGeneration = 0;

/**
 * Run poll() with concurrency guard + at-most-one queued follow-up.
 * - If no poll is in flight, runs poll() and updates lastPollCompletedAt on completion.
 * - If a poll is already in flight, sets queuedPollRequested = true (bounded to one) and
 *   returns the in-flight promise so the caller awaits through the queued follow-up.
 * - The guard clears in finally so a thrown poll does not leave the scheduler stuck.
 */
async function runGuardedPoll(): Promise<CalendarPublication | null> {
  if (inFlightPoll !== null) {
    queuedPollRequested = true;
    return inFlightPoll;
  }
  const run = (async (): Promise<CalendarPublication | null> => {
    while (true) {
      const generation = lifecycleGeneration;
      const isCurrentGeneration = (): boolean => lifecycleGeneration === generation;
      let latest: CalendarPublication | null;
      try {
        latest = await poll(isCurrentGeneration);
      } finally {
        if (isCurrentGeneration()) {
          lastPollCompletedAt = Date.now();
        }
      }
      if (!queuedPollRequested) return latest;
      queuedPollRequested = false;
    }
  })();
  inFlightPoll = run;
  try {
    return await run;
  } finally {
    inFlightPoll = null;
  }
}

/**
 * Force an immediate coordinated poll (fetch + schedule/suspend + push).
 * Cancels the pending setTimeout, runs poll now, then re-arms the next tick.
 * Coalesces within FORCE_POLL_COALESCE_MS after last completed poll.
 */
export async function forcePoll(): Promise<CalendarPublication | null> {
  const now = Date.now();
  if (now - lastPollCompletedAt < FORCE_POLL_COALESCE_MS) {
    // Defer one poll to fire at the end of the coalesce window instead of dropping it.
    if (pendingForcePollTimer === null) {
      const remainingMs = FORCE_POLL_COALESCE_MS - (now - lastPollCompletedAt);
      pendingForcePollTimer = setTimeout(() => {
        pendingForcePollTimer = null;
        void forcePoll();
      }, remainingMs);
      console.debug(`[scheduler] forcePoll deferred — running in ${remainingMs}ms`);
    } else {
      console.debug("[scheduler] forcePoll already deferred — skipping");
    }
    // Caller still awaits in-flight/latest via guarded poll join when possible.
    if (inFlightPoll !== null) return inFlightPoll;
    return null;
  }

  // Cancel the pending background setTimeout so we don't double-poll
  if (state.pollTimeout !== null) {
    clearTimeout(state.pollTimeout);
    state.pollTimeout = null;
  }

  // Bump epoch so the old rescheduled callback (if any) no-ops when it fires
  state.pollEpoch++;
  const epoch = state.pollEpoch;

  const publication = await runGuardedPoll();

  // Re-arm the next scheduled poll from "now" if the scheduler is still active
  if (state.pollEpoch === epoch) {
    function scheduleNextAfterForce(): void {
      state.pollTimeout = setTimeout(
        async () => {
          await runGuardedPoll();
          if (state.pollTimeout !== null && state.pollEpoch === epoch) {
            scheduleNextAfterForce();
          }
        },
        state.powerCallbacks?.getPollInterval?.() ?? 2 * 60 * 1000,
      );
    }
    scheduleNextAfterForce();
  }
  return publication;
}

/** Start the scheduler — call once from app.whenReady() */
export function startScheduler(): void {
  if (state.pollTimeout !== null) return; // already running

  // Bump epoch so any stale timer callbacks from a previous run no-op
  state.pollEpoch++;
  const epoch = state.pollEpoch;

  // Initial poll immediately
  void runGuardedPoll();

  // Then poll with recursive setTimeout (prevents drift/overlap)
  function scheduleNextPoll(): void {
    state.pollTimeout = setTimeout(
      async () => {
        await runGuardedPoll();
        if (state.pollTimeout !== null && state.pollEpoch === epoch) {
          scheduleNextPoll();
        }
      },
      state.powerCallbacks?.getPollInterval?.() ?? 2 * 60 * 1000,
    );
  }
  scheduleNextPoll();
}

/** Stop the scheduler and clear all pending timers — call on before-quit */
export function stopScheduler(options?: { preserveFiredState?: boolean }): void {
  lifecycleGeneration++;
  queuedPollRequested = false;
  cancelCalendarRefresh();
  if (pendingForcePollTimer !== null) {
    clearTimeout(pendingForcePollTimer);
    pendingForcePollTimer = null;
  }
  resetState({ preserveWindow: true, preserveFiredState: options?.preserveFiredState ?? false });
  state.onTrayTitleUpdate?.(null);
  console.log("[scheduler] Stopped");
}

/** Reset module-level facade state for tests — not for production use */
export function _resetForceTestState(): void {
  lifecycleGeneration++;
  if (pendingForcePollTimer !== null) {
    clearTimeout(pendingForcePollTimer);
    pendingForcePollTimer = null;
  }
  lastPollCompletedAt = 0;
  inFlightPoll = null;
  queuedPollRequested = false;
}

/** Restart the scheduler - call when settings change to apply new timing.
 * Preserves firedEvents/alertFiredEvents/cancelledEvents so suppression state survives
 * the stop/start cycle (prevents duplicate browser opens / alerts after wake or settings change). */
export function restartScheduler(): void {
  stopScheduler({ preserveFiredState: true });
  startScheduler();
}

/** Inject the renderer BrowserWindow used for IPC push */
export function setSchedulerWindow(w: BrowserWindow): void {
  state.win = w;
}

/** Set the tray title update callback — called from main/index.ts to decouple scheduler from tray */
export function setTrayTitleCallback(
  fn: (title: string | null, minsRemaining?: number, inMeeting?: boolean) => void,
): void {
  state.onTrayTitleUpdate = fn;
}

/** Inject power-management callbacks (poll interval, sleep prevention) */
export function initPowerCallbacks(callbacks: PowerCallbacks): void {
  state.powerCallbacks = callbacks;
}

/** Last successful calendar fetch — used by global shortcut to join next meeting without polling */
export function getLastKnownEvents(): CalendarResult | null {
  return state.lastKnownEvents;
}

/**
 * Cancel a pending browser-open timer for the given event and mark it as fired
 * so subsequent polls do not re-arm it. Used when the user dismisses the alert.
 * Idempotent — safe to call repeatedly or when no timer exists.
 */
export function cancelPendingBrowserOpen(id: EventId): void {
  cancelBrowserTimer(id, state.timers);
  const endMs = state.scheduledEventData.get(id)?.endMs ?? Date.now();
  state.firedEvents.set(id, endMs + FIRED_EVENT_TTL_MS);
}
