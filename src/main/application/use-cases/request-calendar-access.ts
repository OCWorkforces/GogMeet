import type { CalendarPermission } from "../../../domain/entities/calendar-result.js";
import type { CalendarUiState } from "../../../domain/entities/calendar-ui-state.js";
import type { CalendarPort } from "../ports/calendar-port.js";
import type { EventPublisherPort } from "../ports/event-publisher-port.js";

export interface RequestCalendarAccessDeps {
  calendar: CalendarPort;
  publisher: EventPublisherPort;
  getUiState: () => CalendarUiState;
  setUiState: (partial: Partial<CalendarUiState>) => void;
  setCachedPermission: (status: CalendarPermission) => void;
}

export interface RequestCalendarAccess {
  execute(): Promise<CalendarPermission>;
}

export function createRequestCalendarAccess(
  deps: RequestCalendarAccessDeps,
): RequestCalendarAccess {
  return {
    async execute(): Promise<CalendarPermission> {
      const connecting: Partial<CalendarUiState> = {
        phase: "connecting",
        lastError: null,
        oauthConfigured: deps.calendar.isOAuthConfigured?.() ?? false,
      };
      deps.setUiState(connecting);
      deps.publisher.publishCalendarStatus(deps.getUiState());

      const status = await deps.calendar.requestPermission();
      deps.setCachedPermission(status);

      if (status === "granted") {
        const email = (await deps.calendar.getAccountLabel?.()) ?? null;
        const next: Partial<CalendarUiState> = {
          permission: "granted",
          phase: "ready",
          lastError: null,
          accountEmail: email,
          oauthConfigured: deps.calendar.isOAuthConfigured?.() ?? false,
        };
        deps.setUiState(next);
        deps.publisher.publishCalendarStatus(deps.getUiState());
      } else {
        const next: Partial<CalendarUiState> = {
          permission: status,
          phase: status === "denied" ? "error" : "disconnected",
          lastError: status === "denied" ? "Google Calendar was not connected." : null,
          oauthConfigured: deps.calendar.isOAuthConfigured?.() ?? false,
        };
        deps.setUiState(next);
        deps.publisher.publishCalendarStatus(deps.getUiState());
      }

      return status;
    },
  };
}
