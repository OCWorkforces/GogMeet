import { getCalendarEventsResult } from "../calendar.js";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import { isCalendarOk } from "../../shared/models.js";
import { typedSend } from "../ipc-handlers/shared.js";
import { mainBus } from "../events.js";

import {
  state,
  resetState,
  setConsecutiveErrors,
  setActiveInMeetingEventId,
  incrementConsecutiveErrors,
  markTitleDirty,
  markInMeetingDirty,
} from "./state.js";

import { resolveActiveTitleEvent, clearAllDisplayTimers } from "./countdown.js";

import { scheduleEvents } from "./index.js";

/** Number of consecutive poll errors before force-clearing the tray title (~6 min) */
const MAX_CONSECUTIVE_ERRORS = 3;

/** Minimum ms between force-polls — prevents thrash from rapid tray clicks or wake storms */
const FORCE_POLL_COALESCE_MS = 10_000;

/** Timestamp of the last completed poll (used by forcePoll coalesce guard) */
let lastPollCompletedAt = 0;

/** Clear tray state after too many consecutive poll failures */
function handleMaxConsecutiveErrors(): void {
  markTitleDirty();
  markInMeetingDirty();
  clearAllDisplayTimers();
  setActiveInMeetingEventId(null);
  resolveActiveTitleEvent();
  console.error(
    `[scheduler] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — cleared tray title`,
  );
}

/** Increment error counter and clear tray if threshold reached */
function handlePollFailure(): void {
  incrementConsecutiveErrors();
  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    handleMaxConsecutiveErrors();
  }
}

/** Poll calendar and refresh timers */
export async function poll(): Promise<void> {
  try {
    const result = await getCalendarEventsResult();
    if (isCalendarOk(result)) {
      setConsecutiveErrors(0);
      scheduleEvents(result.events);
      state.lastKnownEvents = result;
      // Notify subscribers (e.g. tray) of the freshly fetched meeting list
      mainBus.emit("meeting-list-updated", result.events);
      // Notify renderer of updated events
      if (state.win && !state.win.isDestroyed()) {
        typedSend(state.win.webContents, IPC_CHANNELS.CALENDAR_EVENTS_UPDATED, undefined);
      }
    } else {
      console.error("[scheduler] Calendar error:", result.error);
      handlePollFailure();
    }
  } catch (err) {
    console.error("[scheduler] Poll error:", err);
    handlePollFailure();
  }
}

/**
 * Force an immediate poll outside the normal schedule.
 * Cancels the pending setTimeout, runs poll() now, then re-arms the next tick.
 * Coalesces: no-ops if a poll completed within the last FORCE_POLL_COALESCE_MS.
 */
export async function forcePoll(): Promise<void> {
  const now = Date.now();
  if (now - lastPollCompletedAt < FORCE_POLL_COALESCE_MS) {
    console.debug('[scheduler] forcePoll skipped — last poll was <10s ago');
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
      state.pollTimeout = setTimeout(async () => {
        await poll();
        lastPollCompletedAt = Date.now();
        if (state.pollTimeout !== null && state.pollEpoch === epoch) {
          scheduleNextAfterForce();
        }
      }, state.powerCallbacks?.getPollInterval?.() ?? 2 * 60 * 1000);
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
    state.pollTimeout = setTimeout(async () => {
      await poll();
      lastPollCompletedAt = Date.now();
      if (state.pollTimeout !== null && state.pollEpoch === epoch) {
        scheduleNextPoll();
      }
    }, state.powerCallbacks?.getPollInterval?.() ?? 2 * 60 * 1000);
  }
  scheduleNextPoll();
}

/** Stop the scheduler and clear all pending timers — call on before-quit */
export function stopScheduler(): void {
  resetState({ preserveWindow: true });
  state.onTrayTitleUpdate?.(null);
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

