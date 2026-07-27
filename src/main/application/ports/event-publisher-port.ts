import type { CalendarUiState } from "../../../domain/entities/calendar-ui-state.js";
import type { MeetingEvent } from "../../../domain/entities/meeting-event.js";

/**
 * Main-process event bus publisher (mainBus).
 * Names match MainEvents in events.ts.
 */
export interface EventPublisherPort {
  publishCalendarStatus(state: CalendarUiState): void;
  publishMeetingList?(events: MeetingEvent[]): void;
}
