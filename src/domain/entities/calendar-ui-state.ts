import type { CalendarPermission } from "./calendar-result.js";
import type { MeetingEvent } from "./meeting-event.js";

/** High-level tray/settings presentation phase for calendar connectivity. */
export type CalendarUiPhase =
  "disconnected" | "connecting" | "ready" | "empty" | "error" | "offline-cached";

/**
 * Snapshot for tray menu and Settings account section.
 * Produced by calendar facade; not an IPC brand boundary.
 */
export interface CalendarUiState {
  readonly permission: CalendarPermission;
  readonly phase: CalendarUiPhase;
  readonly lastError: string | null;
  readonly accountEmail: string | null;
  /** null = never successfully loaded this session */
  readonly events: MeetingEvent[] | null;
  readonly offline: boolean;
  readonly oauthConfigured: boolean;
}

export function defaultCalendarUiState(): CalendarUiState {
  return {
    permission: "not-determined",
    phase: "disconnected",
    lastError: null,
    accountEmail: null,
    events: null,
    offline: false,
    oauthConfigured: false,
  };
}
