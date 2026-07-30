import {
  getLastPublication,
  refreshCalendarPublication,
  reportCalendarPollError,
} from "../facades/calendar.js";
import { recordCalendarResult } from "../facades/calendar-status.js";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import { eventListSignature } from "../../domain/services/event-signature.js";
import {
  isCalendarAutomationEligible,
  isCalendarOk,
} from "../../domain/entities/calendar-result.js";
import type { CalendarPublication } from "../../domain/entities/calendar-publication.js";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import { typedSend } from "../ipc-handlers/shared.js";
import { mainBus } from "../events.js";
import { CalendarRefreshCancelledError } from "../calendar/refresh-coordinator.js";

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

function publishPublicationToUi(publication: CalendarPublication): void {
  const events: MeetingEvent[] = isCalendarOk(publication.result)
    ? [...publication.result.events]
    : [];
  if (isCalendarOk(publication.result)) {
    mainBus.emit("meeting-list-updated", events);
  }
  if (state.win && !state.win.isDestroyed()) {
    const signature = isCalendarOk(publication.result)
      ? eventListSignature(events)
      : `err:${publication.publicationGeneration}`;
    if (signature !== lastSentEventsSignature) {
      lastSentEventsSignature = signature;
      typedSend(state.win.webContents, IPC_CHANNELS.CALENDAR_RESULT_UPDATED, publication);
    }
  }
}

/** Poll calendar and refresh timers. Returns the coordinated publication when successful. */
export async function poll(
  isCurrentGeneration: () => boolean = () => true,
): Promise<CalendarPublication | null> {
  try {
    const publication = await refreshCalendarPublication();
    if (!isCurrentGeneration()) return null;
    const result = publication.result;
    recordCalendarResult(result);
    if (isCalendarOk(result)) {
      setConsecutiveErrors(0);
      // Always keep display/join snapshot for any successful result.
      state.lastKnownEvents = result;
      publishPublicationToUi(publication);

      if (isCalendarAutomationEligible(result)) {
        scheduleEvents(result.events);
      } else {
        // Partial / offline: cancel automatic browser/alert/title/countdown work;
        // tray/popover/shortcut still use lastKnownEvents + join hub.
        suspendAutomation();
      }
      return publication;
    }
    console.error("[scheduler] Calendar error:", result.error);
    // Still push error publication so renderer can update without a second fetch.
    publishPublicationToUi(publication);
    const lastEvents =
      state.lastKnownEvents && isCalendarOk(state.lastKnownEvents)
        ? state.lastKnownEvents.events
        : null;
    reportCalendarPollError(result.error, lastEvents);
    handlePollFailure();
    return publication;
  } catch (err) {
    if (!isCurrentGeneration()) return null;
    if (err instanceof CalendarRefreshCancelledError) {
      console.debug("[scheduler] Poll cancelled");
      return getLastPublication();
    }
    console.error("[scheduler] Poll error:", err);
    const message = err instanceof Error ? err.message : String(err);
    const lastEvents =
      state.lastKnownEvents && isCalendarOk(state.lastKnownEvents)
        ? state.lastKnownEvents.events
        : null;
    reportCalendarPollError(message, lastEvents);
    handlePollFailure();
    return null;
  }
}

/** Reset mutable state for tests — not for production use */
export function _resetForTest(): void {
  resetState();
  lastSentEventsSignature = null;
}
