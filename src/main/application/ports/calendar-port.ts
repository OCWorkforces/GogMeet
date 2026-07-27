import type {
  CalendarPermission,
  CalendarResult,
} from "../../../domain/entities/calendar-result.js";

/**
 * Application port for calendar backends (EventKit, Google, fixture).
 */
export interface CalendarPort {
  getEvents(): Promise<CalendarResult>;
  getPermissionStatus(): Promise<CalendarPermission>;
  requestPermission(): Promise<CalendarPermission>;
  /** Optional change watch (EventKit sidecar). No-op providers omit this. */
  startWatch?(onChange: () => void): void;
  stopWatch?(): void;
  disconnect?(): Promise<void>;
  /** Background prep (Swift compile, token soft-refresh). */
  warmup?(): Promise<void>;
  /** Connected account label (e.g. Google email); null when unknown. */
  getAccountLabel?(): Promise<string | null>;
  /** Whether OAuth/client is configured (Windows Connect CTA). */
  isOAuthConfigured?(): boolean;
  /** True while an OAuth flow is in progress. */
  isOAuthInFlight?(): boolean;
  /** Recover a failed EventKit watch sidecar after resume. */
  reviveWatch?(): void;
}
