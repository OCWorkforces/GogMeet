import { getCalendarEventsResult, reportCalendarPollError } from "../facades/calendar.js";
import { recordCalendarResult } from "../facades/calendar-status.js";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import { eventListSignature } from "../../domain/services/event-signature.js";
import {
  isCalendarAutomationEligible,
  isCalendarOk,
} from "../../domain/entities/calendar-result.js";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
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
} from "./state/index.js";

import { resolveActiveTitleEvent, clearAllDisplayTimers } from "./countdown.js";
import { suspendAutomation } from "./suspend-automation.js";

import { scheduleEvents } from "./index.js";

/** Number of consecutive poll errors before force-clearing the tray title (~6 min) */
const MAX_CONSECUTIVE_ERRORS = 3;

/** Last sent events signature — null sentinel ensures first poll always sends */
let lastSentEventsSignature: string | null = null;

/** Clear tray state after too many consecutive poll failures */
function handleMaxConsecutiveErrors(): void {
  markTitleDirty();
  markInMeetingDirty();
  clearAllDisplayTimers();
  setActiveInMeetingEventId(null);
  resolveActiveTitleEvent();
  console.error(`[scheduler] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — cleared tray title`);
}

/** Increment error counter and clear tray exactly once when threshold is crossed */
function handlePollFailure(): void {
  const wasBelow = state.consecutiveErrors < MAX_CONSECUTIVE_ERRORS;
  incrementConsecutiveErrors();
  if (wasBelow && state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    handleMaxConsecutiveErrors();
  }
}

function publishEventsToUi(events: readonly MeetingEvent[]): void {
  const list = [...events];
  mainBus.emit("meeting-list-updated", list);
  if (state.win && !state.win.isDestroyed()) {
    const signature = eventListSignature(list);
    if (signature !== lastSentEventsSignature) {
      lastSentEventsSignature = signature;
      typedSend(state.win.webContents, IPC_CHANNELS.CALENDAR_EVENTS_UPDATED, list);
    }
  }
}

/** Poll calendar and refresh timers */
export async function poll(isCurrentGeneration: () => boolean = () => true): Promise<void> {
  try {
    const result = await getCalendarEventsResult();
    if (!isCurrentGeneration()) return;
    recordCalendarResult(result);
    if (isCalendarOk(result)) {
      setConsecutiveErrors(0);
      // Always keep display/join snapshot for any successful result.
      state.lastKnownEvents = result;
      publishEventsToUi(result.events);

      if (isCalendarAutomationEligible(result)) {
        scheduleEvents(result.events);
      } else {
        // Partial / offline: cancel automatic browser/alert/title/countdown work;
        // tray/popover/shortcut still use lastKnownEvents + join hub.
        suspendAutomation();
      }
    } else {
      console.error("[scheduler] Calendar error:", result.error);
      const lastEvents =
        state.lastKnownEvents && isCalendarOk(state.lastKnownEvents)
          ? state.lastKnownEvents.events
          : null;
      reportCalendarPollError(result.error, lastEvents);
      handlePollFailure();
    }
  } catch (err) {
    if (!isCurrentGeneration()) return;
    console.error("[scheduler] Poll error:", err);
    const message = err instanceof Error ? err.message : String(err);
    const lastEvents =
      state.lastKnownEvents && isCalendarOk(state.lastKnownEvents)
        ? state.lastKnownEvents.events
        : null;
    reportCalendarPollError(message, lastEvents);
    handlePollFailure();
  }
}

/** Reset mutable state for tests — not for production use */
export function _resetForTest(): void {
  resetState();
  lastSentEventsSignature = null;
}
