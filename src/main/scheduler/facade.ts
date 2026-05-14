// scheduler/facade.ts — single public entry point for external consumers.
// Function bodies live here so external imports are 1-hop. Internal scheduler
// files (poll.ts, index.ts, state.ts, countdown.ts) MUST NOT import from this
// module to avoid cycles — they cross-import each other directly instead.

import type { BrowserWindow } from "electron";
import type { CalendarResult } from "../../shared/calendar-result.js";
import { state, resetState, type PowerCallbacks } from "./state/index.js";
import { poll } from "./poll.js";
import { cancelBrowserTimer } from "./browser-timer.js";
import type { EventId } from "../../shared/brand.js";
import { FIRED_EVENT_TTL_MS } from "./state/state-timers.js";

/** Minimum ms between force-polls — prevents thrash from rapid tray clicks or wake storms */
const FORCE_POLL_COALESCE_MS = 10_000;

/** Timestamp of the last completed poll (used by forcePoll coalesce guard) */
let lastPollCompletedAt = 0;

/** Pending deferred forcePoll timer scheduled when a forcePoll is coalesced */
let pendingForcePollTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Force an immediate poll outside the normal schedule.
 * Cancels the pending setTimeout, runs poll() now, then re-arms the next tick.
 * Coalesces: no-ops if a poll completed within the last FORCE_POLL_COALESCE_MS.
 */
export async function forcePoll(): Promise<void> {
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
    return;
  }

  // Cancel the pending background setTimeout so we don't double-poll
  if (state.pollTimeout !== null) {
    clearTimeout(state.pollTimeout);
    state.pollTimeout = null;
  }

  // Bump epoch so the old rescheduled callback (if any) no-ops when it fires
  state.pollEpoch++;
  const epoch = state.pollEpoch;

  await poll();
  lastPollCompletedAt = Date.now();

  // Re-arm the next scheduled poll from "now" if the scheduler is still running
  // Re-arm the next scheduled poll from "now" if the scheduler is still active
  if (state.pollEpoch === epoch) {
    function scheduleNextAfterForce(): void {
      state.pollTimeout = setTimeout(
        async () => {
          await poll();
          lastPollCompletedAt = Date.now();
          if (state.pollTimeout !== null && state.pollEpoch === epoch) {
            scheduleNextAfterForce();
          }
        },
        state.powerCallbacks?.getPollInterval?.() ?? 2 * 60 * 1000,
      );
    }
    scheduleNextAfterForce();
  }
}

/** Start the scheduler — call once from app.whenReady() */
export function startScheduler(): void {
  if (state.pollTimeout !== null) return; // already running

  // Bump epoch so any stale timer callbacks from a previous run no-op
  state.pollEpoch++;
  const epoch = state.pollEpoch;

  // Initial poll immediately
  void poll();

  // Then poll with recursive setTimeout (prevents drift/overlap)
  function scheduleNextPoll(): void {
    state.pollTimeout = setTimeout(
      async () => {
        await poll();
        lastPollCompletedAt = Date.now();
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
export function stopScheduler(): void {
  if (pendingForcePollTimer !== null) {
    clearTimeout(pendingForcePollTimer);
    pendingForcePollTimer = null;
  }
  resetState({ preserveWindow: true });
  state.onTrayTitleUpdate?.(null);
  console.log("[scheduler] Stopped");
}

/** Reset module-level facade state for tests — not for production use */
export function _resetForceTestState(): void {
  if (pendingForcePollTimer !== null) {
    clearTimeout(pendingForcePollTimer);
    pendingForcePollTimer = null;
  }
  lastPollCompletedAt = 0;
}

/** Restart the scheduler - call when settings change to apply new timing */
export function restartScheduler(): void {
  stopScheduler();
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
