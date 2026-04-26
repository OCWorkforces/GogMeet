/**
 * Payload sent to the alert window via the `alert:show` push channel.
 *
 * This is a narrow projection of {@link MeetingEvent} containing exactly
 * the fields the alert renderer (`src/renderer/alert/index.ts`) needs to
 * render the full-screen meeting alert. Constructed by `alert-window.ts`
 * just before `typedSend()` and consumed by the renderer via
 * `window.api.alert.onShowAlert()`.
 */
import type { EventId, IsoUtc } from './brand.js';

export interface AlertPayload {
  /** Stable meeting id (matches MeetingEvent.id) — used for coalescing/diagnostics */
  id: EventId;
  /** Meeting title */
  title: string;
  /** Meeting start time (ISO 8601 UTC) */
  startDate: IsoUtc;
  /** Meeting end time (ISO 8601 UTC) */
  endDate: IsoUtc;
  /** Source calendar display name */
  calendarName: string;
  /** Whether the event is an all-day event */
  isAllDay: boolean;
  /** Optional event description/notes */
  description?: string;
}
