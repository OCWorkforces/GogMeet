import type {
  CalendarPermission,
  CalendarResult,
} from "../../../domain/entities/calendar-result.js";
import type { CalendarUiState } from "../../../domain/entities/calendar-ui-state.js";
import type { CalendarPort } from "../ports/calendar-port.js";
import type { EventPublisherPort } from "../ports/event-publisher-port.js";

export interface GetMeetingsDeps {
  calendar: CalendarPort;
  publisher: EventPublisherPort;
  /** Temporary account email peek (until CalendarPort exposes getAccountLabel). */
  getAccountEmail: () => Promise<string | null>;
  isOAuthConfigured: () => boolean;
  /** Mutable UI state snapshot owned by facade/bind site */
  getUiState: () => CalendarUiState;
  setUiState: (partial: Partial<CalendarUiState>) => void;
  setCachedPermission: (status: CalendarPermission) => void;
}

export interface GetMeetings {
  execute(): Promise<CalendarResult>;
}

export function createGetMeetings(deps: GetMeetingsDeps): GetMeetings {
  return {
    async execute(): Promise<CalendarResult> {
      const result = await deps.calendar.getEvents();

      if (result.kind === "ok") {
        const email = (await deps.getAccountEmail()) ?? deps.getUiState().accountEmail;
        const next: Partial<CalendarUiState> = {
          permission: "granted",
          phase: result.events.length === 0 ? "empty" : "ready",
          lastError: null,
          events: result.events,
          offline: false,
          accountEmail: email,
          oauthConfigured: deps.isOAuthConfigured(),
        };
        deps.setUiState(next);
        deps.setCachedPermission("granted");
        deps.publisher.publishCalendarStatus(deps.getUiState());
      } else {
        const permission = await deps.calendar.getPermissionStatus().catch(() => "denied" as const);
        deps.setCachedPermission(permission);
        const next: Partial<CalendarUiState> = {
          permission,
          phase: "error",
          lastError: result.error,
          oauthConfigured: deps.isOAuthConfigured(),
        };
        deps.setUiState(next);
        deps.publisher.publishCalendarStatus(deps.getUiState());
      }

      return result;
    },
  };
}
