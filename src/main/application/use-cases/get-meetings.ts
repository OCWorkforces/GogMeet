import type {
  CalendarPermission,
  CalendarResult,
} from "../../../domain/entities/calendar-result.js";
import type { CalendarUiState } from "../../../domain/entities/calendar-ui-state.js";
import { CALENDAR_LIMITED_COPY } from "../../../domain/entities/calendar-ui-state.js";
import type { CalendarPort } from "../ports/calendar-port.js";
import type { EventPublisherPort } from "../ports/event-publisher-port.js";

export interface GetMeetingsDeps {
  calendar: CalendarPort;
  publisher: EventPublisherPort;
  getUiState: () => CalendarUiState;
  setUiState: (partial: Partial<CalendarUiState>) => void;
  setCachedPermission: (status: CalendarPermission) => void;
}

export interface GetMeetings {
  execute(signal?: AbortSignal): Promise<CalendarResult>;
}

export function createGetMeetings(deps: GetMeetingsDeps): GetMeetings {
  return {
    async execute(signal: AbortSignal = new AbortController().signal): Promise<CalendarResult> {
      const result = await deps.calendar.getEvents(signal);
      const prev = deps.getUiState();
      const oauthConfigured = deps.calendar.isOAuthConfigured?.() ?? false;

      if (result.kind === "ok") {
        const email =
          (await deps.calendar.getAccountLabel?.()) ?? prev.accountEmail;

        if (result.source === "offline-cache") {
          // Offline never sets permission from kind==="ok"; preserve last recorded.
          const permission: CalendarPermission =
            prev.permission === "granted" || prev.permission === "denied"
              ? prev.permission
              : "not-determined";
          const cacheAgeMs = Math.max(0, Date.now() - result.cachedAt);
          const next: Partial<CalendarUiState> = {
            permission,
            phase: "offline-cached",
            lastError: null,
            events: result.events,
            offline: true,
            accountEmail: email,
            oauthConfigured,
            cacheAgeMs,
          };
          deps.setUiState(next);
          // Do not overwrite cached permission to granted from offline success.
          deps.publisher.publishCalendarStatus(deps.getUiState());
          return result;
        }

        // Live success
        if (result.completeness === "partial") {
          const next: Partial<CalendarUiState> = {
            permission: "granted",
            phase: "limited",
            lastError: CALENDAR_LIMITED_COPY,
            events: result.events,
            offline: false,
            accountEmail: email,
            oauthConfigured,
            cacheAgeMs: null,
          };
          deps.setUiState(next);
          deps.setCachedPermission("granted");
          deps.publisher.publishCalendarStatus(deps.getUiState());
          return result;
        }

        const next: Partial<CalendarUiState> = {
          permission: "granted",
          phase: result.events.length === 0 ? "empty" : "ready",
          lastError: null,
          events: result.events,
          offline: false,
          accountEmail: email,
          oauthConfigured,
          cacheAgeMs: null,
        };
        deps.setUiState(next);
        deps.setCachedPermission("granted");
        deps.publisher.publishCalendarStatus(deps.getUiState());
        return result;
      }

      const permission = await deps.calendar.getPermissionStatus().catch(() => "denied" as const);
      deps.setCachedPermission(permission);
      const next: Partial<CalendarUiState> = {
        permission,
        phase: "error",
        lastError: result.error,
        oauthConfigured,
        cacheAgeMs: null,
      };
      deps.setUiState(next);
      deps.publisher.publishCalendarStatus(deps.getUiState());
      return result;
    },
  };
}
