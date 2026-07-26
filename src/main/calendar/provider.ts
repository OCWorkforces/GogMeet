import type { CalendarPermission, CalendarResult } from "../../shared/calendar-result.js";

/** Stable provider ids used by the factory and (later) settings. */
export type CalendarProviderId =
  "darwin-eventkit" | "google-calendar" | "microsoft-graph" | "fixture" | "stub-unsupported";

/**
 * Platform calendar backend. Domain `calendar.ts` is the only production
 * entry; providers must not be imported by scheduler/IPC/tray directly.
 */
export interface CalendarProvider {
  readonly id: CalendarProviderId;
  getEvents(): Promise<CalendarResult>;
  getPermissionStatus(): Promise<CalendarPermission>;
  requestPermission(): Promise<CalendarPermission>;
  /** Optional change watch (EventKit sidecar). No-op providers omit this. */
  startWatch?(onChange: () => void): void;
  stopWatch?(): void;
  disconnect?(): Promise<void>;
  /** Background prep (Swift compile, token soft-refresh). */
  warmup?(): Promise<void>;
}
