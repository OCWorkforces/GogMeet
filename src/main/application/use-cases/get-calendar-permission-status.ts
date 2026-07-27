import type { CalendarPermission } from "../../../domain/entities/calendar-result.js";
import type { CalendarUiState } from "../../../domain/entities/calendar-ui-state.js";
import type { CalendarPort } from "../ports/calendar-port.js";
import type { EventPublisherPort } from "../ports/event-publisher-port.js";

export interface GetCalendarPermissionStatusDeps {
  calendar: CalendarPort;
  publisher: EventPublisherPort;
  isOAuthInFlight: () => boolean;
  getCachedPermission: () => CalendarPermission | null;
  setCachedPermission: (status: CalendarPermission) => void;
  getAccountEmail: () => Promise<string | null>;
  isOAuthConfigured: () => boolean;
  getUiState: () => CalendarUiState;
  setUiState: (partial: Partial<CalendarUiState>) => void;
}

export interface GetCalendarPermissionStatus {
  execute(): Promise<CalendarPermission>;
}

export function createGetCalendarPermissionStatus(
  deps: GetCalendarPermissionStatusDeps,
): GetCalendarPermissionStatus {
  return {
    async execute(): Promise<CalendarPermission> {
      if (deps.isOAuthInFlight()) return "not-determined";
      const cached = deps.getCachedPermission();
      if (cached !== null) return cached;

      const status = await deps.calendar.getPermissionStatus();
      deps.setCachedPermission(status);

      const ui = deps.getUiState();
      const next: Partial<CalendarUiState> = {
        permission: status,
        phase:
          status === "granted"
            ? ui.events && ui.events.length > 0
              ? "ready"
              : "empty"
            : "disconnected",
        oauthConfigured: deps.isOAuthConfigured(),
        accountEmail: (await deps.getAccountEmail()) ?? ui.accountEmail,
      };
      deps.setUiState(next);
      deps.publisher.publishCalendarStatus(deps.getUiState());

      return status;
    },
  };
}
