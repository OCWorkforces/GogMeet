/**
 * Payload sent to the alert window via the `alert:show` push channel.
 *
 * This is a narrow projection of {@link MeetingEvent} containing exactly
 * the fields the alert renderer (`src/renderer/alert/index.ts`) needs to
 * render the full-screen meeting alert. Constructed by `alert-window.ts`
 * just before `typedSend()` and consumed by the renderer via
 * `window.api.alert.onShowAlert()`.
 *
 * NOTE: `meetUrl` is intentionally NOT included in this payload. The
 * full-screen alert is purely a display surface — it does not navigate to
 * or open the meeting URL itself (browser auto-open is handled separately
 * by the scheduler in the main process). Only fields needed for visual
 * rendering (title, times, calendar name, description) are projected here.
 * Keeping this payload minimal reduces the IPC surface area and prevents
 * the renderer from accidentally gaining the ability to open URLs.
 */
import type { EventId, IsoUtc } from "./brand.js";

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
  /** When browser auto-open is scheduled (ISO UTC); used for countdown copy */
  autoOpenAt?: IsoUtc;
  /** Whether a joinable meeting URL exists (URL itself stays in main) */
  hasMeetUrl?: boolean;
}
