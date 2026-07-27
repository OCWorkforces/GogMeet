import type { CalendarPermission, CalendarResult } from "../../domain/entities/calendar-result.js";
import type { CalendarUiState } from "../../domain/entities/calendar-ui-state.js";
import { defaultCalendarUiState } from "../../domain/entities/calendar-ui-state.js";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import { getActiveCalendarProvider, resetCalendarProvider } from "../calendar/factory.js";
import { isGoogleOAuthConfigured } from "../calendar/auth/google-client-id.js";
import { isGoogleOAuthInFlight } from "../calendar/auth/google-oauth.js";
import { loadGoogleTokens } from "../calendar/auth/google-token-store.js";
import { isDarwin } from "../platform/os.js";
import { mainBus } from "../events.js";
import type { CalendarPort } from "../application/ports/calendar-port.js";
import type { EventPublisherPort } from "../application/ports/event-publisher-port.js";
import { createGetMeetings, type GetMeetings } from "../application/use-cases/get-meetings.js";
import {
  createRequestCalendarAccess,
  type RequestCalendarAccess,
} from "../application/use-cases/request-calendar-access.js";
import {
  createGetCalendarPermissionStatus,
  type GetCalendarPermissionStatus,
} from "../application/use-cases/get-calendar-permission-status.js";
import {
  createDisconnectCalendar,
  type DisconnectCalendar,
} from "../application/use-cases/disconnect-calendar.js";

let cachedPermissionStatus: CalendarPermission | null = null;
let uiState: CalendarUiState = defaultCalendarUiState();

function setUiState(partial: Partial<CalendarUiState>): void {
  uiState = { ...uiState, ...partial };
}

function replaceUiState(state: CalendarUiState): void {
  uiState = state;
}

function setCachedPermission(status: CalendarPermission | null): void {
  cachedPermissionStatus = status;
}

/** CalendarPort adapter over the active factory provider. */
async function getCalendarPort(): Promise<CalendarPort> {
  return getActiveCalendarProvider();
}

/** Lazy CalendarPort so factory selection runs per call (fixture/warmup). */
function lazyCalendarPort(): CalendarPort {
  return {
    getEvents: async () => (await getCalendarPort()).getEvents(),
    getPermissionStatus: async () => (await getCalendarPort()).getPermissionStatus(),
    requestPermission: async () => (await getCalendarPort()).requestPermission(),
    disconnect: async () => {
      await (await getCalendarPort()).disconnect?.();
    },
    warmup: async () => {
      await (await getCalendarPort()).warmup?.();
    },
  };
}

const publisher: EventPublisherPort = {
  publishCalendarStatus(state: CalendarUiState): void {
    mainBus.emit("calendar-status-updated", state);
  },
};

function oauthDeps() {
  return {
    getAccountEmail: async (): Promise<string | null> => (await loadGoogleTokens())?.email ?? null,
    isOAuthConfigured: (): boolean => isGoogleOAuthConfigured(),
    isOAuthInFlight: (): boolean => isGoogleOAuthInFlight(),
  };
}

function createDefaultGetMeetings(): GetMeetings {
  const oauth = oauthDeps();
  return createGetMeetings({
    calendar: lazyCalendarPort(),
    publisher,
    getAccountEmail: oauth.getAccountEmail,
    isOAuthConfigured: oauth.isOAuthConfigured,
    getUiState: () => uiState,
    setUiState,
    setCachedPermission: (s) => {
      cachedPermissionStatus = s;
    },
  });
}

function createDefaultRequestAccess(): RequestCalendarAccess {
  const oauth = oauthDeps();
  return createRequestCalendarAccess({
    calendar: lazyCalendarPort(),
    publisher,
    getAccountEmail: oauth.getAccountEmail,
    isOAuthConfigured: oauth.isOAuthConfigured,
    getUiState: () => uiState,
    setUiState,
    setCachedPermission: (s) => {
      cachedPermissionStatus = s;
    },
  });
}

function createDefaultPermissionStatus(): GetCalendarPermissionStatus {
  const oauth = oauthDeps();
  return createGetCalendarPermissionStatus({
    calendar: lazyCalendarPort(),
    publisher,
    isOAuthInFlight: oauth.isOAuthInFlight,
    getCachedPermission: () => cachedPermissionStatus,
    setCachedPermission: (s) => {
      cachedPermissionStatus = s;
    },
    getAccountEmail: oauth.getAccountEmail,
    isOAuthConfigured: oauth.isOAuthConfigured,
    getUiState: () => uiState,
    setUiState,
  });
}

function createDefaultDisconnect(): DisconnectCalendar {
  return createDisconnectCalendar({
    calendar: lazyCalendarPort(),
    publisher,
    resetProvider: () => {
      resetCalendarProvider();
    },
    isOAuthConfigured: () => isGoogleOAuthConfigured(),
    setCachedPermission,
    setUiState: replaceUiState,
  });
}

let _getMeetings: GetMeetings = createDefaultGetMeetings();
let _requestAccess: RequestCalendarAccess = createDefaultRequestAccess();
let _permissionStatus: GetCalendarPermissionStatus = createDefaultPermissionStatus();
let _disconnect: DisconnectCalendar = createDefaultDisconnect();

/** Test / composition override for calendar use cases. */
export function bindCalendarUseCases(bindings: {
  getMeetings?: GetMeetings;
  requestAccess?: RequestCalendarAccess;
  permissionStatus?: GetCalendarPermissionStatus;
  disconnect?: DisconnectCalendar;
}): void {
  if (bindings.getMeetings) _getMeetings = bindings.getMeetings;
  if (bindings.requestAccess) _requestAccess = bindings.requestAccess;
  if (bindings.permissionStatus) _permissionStatus = bindings.permissionStatus;
  if (bindings.disconnect) _disconnect = bindings.disconnect;
}

/** Reset module-level defaults (tests / composition re-bind). */
export function rebindCalendarDefaults(): void {
  _getMeetings = createDefaultGetMeetings();
  _requestAccess = createDefaultRequestAccess();
  _permissionStatus = createDefaultPermissionStatus();
  _disconnect = createDefaultDisconnect();
}

/** Synchronous snapshot for tray menu builders. */
export function getCalendarUiState(): CalendarUiState {
  return uiState;
}

/** Fetch calendar events — returns structured result with events or error. */
export async function getCalendarEventsResult(): Promise<CalendarResult> {
  return _getMeetings.execute();
}

/**
 * Trigger permission flow for the active provider.
 * Darwin: Calendar.app AppleScript probe / TCC dialog.
 * Windows: OAuth when invoked from tray/Settings — not from lifecycle auto path.
 */
export async function requestCalendarPermission(): Promise<CalendarPermission> {
  return _requestAccess.execute();
}

/** Check current calendar permission state without triggering a new dialog when cached. */
export async function getCalendarPermissionStatus(): Promise<CalendarPermission> {
  return _permissionStatus.execute();
}

/** Invalidate cached permission — call on power state resume as a safety net. */
export function invalidateCalendarPermissionCache(): void {
  cachedPermissionStatus = null;
}

/**
 * Whether lifecycle may auto-call `requestCalendarPermission` when status is
 * `not-determined`. Darwin only — Windows must not auto-open OAuth (K16).
 */
export function shouldAutoRequestCalendarPermission(): boolean {
  return isDarwin();
}

/** Pre-warm the active provider (Swift compile on Darwin / token soft-refresh on Google). */
export async function warmupCalendarProvider(): Promise<void> {
  await lazyCalendarPort().warmup?.();
}

/** Disconnect Google / reset provider. Clears permission cache and UI state. */
export async function disconnectCalendar(): Promise<void> {
  return _disconnect.execute();
}

/** Apply a poll-level error while optionally retaining last events for offline UI. */
export function reportCalendarPollError(error: string, lastEvents: MeetingEvent[] | null): void {
  setUiState({
    phase: lastEvents && lastEvents.length > 0 ? "offline-cached" : "error",
    lastError: error,
    events: lastEvents,
    offline: !!(lastEvents && lastEvents.length > 0),
    oauthConfigured: isGoogleOAuthConfigured(),
  });
  mainBus.emit("calendar-status-updated", uiState);
}
