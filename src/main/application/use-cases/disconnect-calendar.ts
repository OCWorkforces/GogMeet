import type { CalendarPermission } from "../../../domain/entities/calendar-result.js";
import type { CalendarUiState } from "../../../domain/entities/calendar-ui-state.js";
import { defaultCalendarUiState } from "../../../domain/entities/calendar-ui-state.js";
import type { CalendarPort } from "../ports/calendar-port.js";
import type { EventPublisherPort } from "../ports/event-publisher-port.js";

export interface DisconnectCalendarDeps {
  calendar: CalendarPort;
  publisher: EventPublisherPort;
  resetProvider: () => void;
  setCachedPermission: (status: CalendarPermission | null) => void;
  setUiState: (state: CalendarUiState) => void;
}

export interface DisconnectCalendar {
  execute(): Promise<void>;
}

export function createDisconnectCalendar(deps: DisconnectCalendarDeps): DisconnectCalendar {
  return {
    async execute(): Promise<void> {
      await deps.calendar.disconnect?.();
      deps.resetProvider();
      deps.setCachedPermission(null);
      const next: CalendarUiState = {
        ...defaultCalendarUiState(),
        oauthConfigured: deps.calendar.isOAuthConfigured?.() ?? false,
        phase: "disconnected",
        permission: "not-determined",
      };
      deps.setUiState(next);
      deps.publisher.publishCalendarStatus(next);
    },
  };
}
