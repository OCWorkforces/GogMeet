import type {
  CalendarPermission,
  CalendarResult,
} from "../../../domain/entities/calendar-result.js";

/**
 * Application port for calendar backends (EventKit, Google, fixture).
 * Mirrors today's CalendarProvider; may gain getAccountLabel / reviveWatch later.
 */
export interface CalendarPort {
  getEvents(): Promise<CalendarResult>;
  getPermissionStatus(): Promise<CalendarPermission>;
  requestPermission(): Promise<CalendarPermission>;
  startWatch?(onChange: () => void): void;
  stopWatch?(): void;
  disconnect?(): Promise<void>;
  warmup?(): Promise<void>;
}
