import { getCalendarEventsResult } from "../calendar.js";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import { getPollInterval } from "../power.js";

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
        markTitleDirty();
        markInMeetingDirty();
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
      markTitleDirty();
      markInMeetingDirty();
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
  if (state.pollTimeout !== null) return; // already running

  // Initial poll immediately
  void poll();

  // Then poll with recursive setTimeout (prevents drift/overlap)
  function scheduleNextPoll(): void {
    state.pollTimeout = setTimeout(async () => {
      await poll();
      if (state.pollTimeout !== null) {
        scheduleNextPoll();
      }
    }, getPollInterval());
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

/** Backward-compatible alias for existing tests */
export function _resetConsecutiveErrors(): void {
  _resetForTest();
}
