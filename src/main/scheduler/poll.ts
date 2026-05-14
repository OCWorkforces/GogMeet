import { getCalendarEventsResult } from "../domain/calendar.js";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import { type MeetingEvent } from "../../shared/meeting-event.js";
import { isCalendarOk } from "../../shared/calendar-result.js";
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

import { scheduleEvents } from "./index.js";

/** Number of consecutive poll errors before force-clearing the tray title (~6 min) */
const MAX_CONSECUTIVE_ERRORS = 3;

/** Last sent events hash — null sentinel ensures first poll always sends */
let lastSentEventsHash: string | null = null;

/** Compute stable hash for event list — used to gate IPC push */
function computeEventsHash(events: MeetingEvent[]): string {
  const SEP = "\x1F";
  return events
    .map((e) =>
      [
        e.id,
        e.startDate,
        e.endDate,
        e.title,
        e.meetUrl ?? "",
        e.userEmail ?? "",
        String(e.isAllDay),
        e.calendarName,
        e.description ?? "",
      ].join(SEP),
    )
    .join(SEP);
}

/** Clear tray state after too many consecutive poll failures */
function handleMaxConsecutiveErrors(): void {
  markTitleDirty();
  markInMeetingDirty();
  clearAllDisplayTimers();
  setActiveInMeetingEventId(null);
  resolveActiveTitleEvent();
  console.error(`[scheduler] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — cleared tray title`);
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
      // Notify renderer of updated events — only if content actually changed
      if (state.win && !state.win.isDestroyed()) {
        const eventHash = computeEventsHash(result.events);
        if (eventHash !== lastSentEventsHash) {
          lastSentEventsHash = eventHash;
          typedSend(state.win.webContents, IPC_CHANNELS.CALENDAR_EVENTS_UPDATED, result.events);
        }
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

/** Reset mutable state for tests — not for production use */
export function _resetForTest(): void {
  resetState();
  lastSentEventsHash = null;
}
