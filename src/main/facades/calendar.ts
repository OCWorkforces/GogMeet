import type { CalendarPermission, CalendarResult } from "../../domain/entities/calendar-result.js";
import type { CalendarPublication } from "../../domain/entities/calendar-publication.js";
import {
  bindCalendarRefreshFetcher,
  cancelCalendarRefresh,
  requestCalendarRefresh,
  getLastCalendarPublication,
  _resetCalendarRefreshCoordinatorForTest,
} from "../calendar/refresh-coordinator.js";
import type { CalendarUiState } from "../../domain/entities/calendar-ui-state.js";
import { defaultCalendarUiState } from "../../domain/entities/calendar-ui-state.js";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import { getActiveCalendarProvider, resetCalendarProvider } from "../calendar/factory.js";
import type { CalendarProvider } from "../calendar/provider.js";
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
/** Last resolved provider for sync isOAuthConfigured / reviveWatch. */
let cachedProvider: CalendarProvider | null = null;

function setUiState(partial: Partial<CalendarUiState>): void {
  uiState = { ...uiState, ...partial };
}

function replaceUiState(state: CalendarUiState): void {
  uiState = state;
}

function setCachedPermission(status: CalendarPermission | null): void {
  cachedPermissionStatus = status;
}

function asCalendarPort(provider: CalendarProvider): CalendarPort {
  const port: CalendarPort = {
    getEvents: (signal) => provider.getEvents(signal),
    getPermissionStatus: () => provider.getPermissionStatus(),
    requestPermission: () => provider.requestPermission(),
  };
  if (provider.startWatch) port.startWatch = provider.startWatch.bind(provider);
  if (provider.stopWatch) port.stopWatch = provider.stopWatch.bind(provider);
  if (provider.disconnect) port.disconnect = provider.disconnect.bind(provider);
  if (provider.warmup) port.warmup = provider.warmup.bind(provider);
  if (provider.getAccountLabel) port.getAccountLabel = provider.getAccountLabel.bind(provider);
  if (provider.isOAuthConfigured)
    port.isOAuthConfigured = provider.isOAuthConfigured.bind(provider);
  if (provider.isOAuthInFlight) port.isOAuthInFlight = provider.isOAuthInFlight.bind(provider);
  if (provider.reviveWatch) port.reviveWatch = provider.reviveWatch.bind(provider);
  return port;
}

async function resolveProvider(): Promise<CalendarProvider> {
  const provider = await getActiveCalendarProvider();
  cachedProvider = provider;
  return provider;
}

/** Lazy CalendarPort so factory selection runs per call. */
function lazyCalendarPort(): CalendarPort {
  return {
    getEvents: async (signal) => asCalendarPort(await resolveProvider()).getEvents(signal),
    getPermissionStatus: async () => asCalendarPort(await resolveProvider()).getPermissionStatus(),
    requestPermission: async () => asCalendarPort(await resolveProvider()).requestPermission(),
    startWatch: (onChange) => {
      void resolveProvider().then((p) => p.startWatch?.(onChange));
    },
    stopWatch: () => {
      cachedProvider?.stopWatch?.();
    },
    disconnect: async () => {
      await asCalendarPort(await resolveProvider()).disconnect?.();
    },
    warmup: async () => {
      await asCalendarPort(await resolveProvider()).warmup?.();
    },
    getAccountLabel: async () =>
      (await asCalendarPort(await resolveProvider()).getAccountLabel?.()) ?? null,
    isOAuthConfigured: () => cachedProvider?.isOAuthConfigured?.() ?? false,
    isOAuthInFlight: () => cachedProvider?.isOAuthInFlight?.() ?? false,
    reviveWatch: () => {
      if (cachedProvider?.reviveWatch) {
        cachedProvider.reviveWatch();
        return;
      }
      void resolveProvider().then((p) => p.reviveWatch?.());
    },
  };
}

const publisher: EventPublisherPort = {
  publishCalendarStatus(state: CalendarUiState): void {
    mainBus.emit("calendar-status-updated", state);
  },
};

function createDefaultGetMeetings(): GetMeetings {
  return createGetMeetings({
    calendar: lazyCalendarPort(),
    publisher,
    getUiState: () => uiState,
    setUiState,
    setCachedPermission: (s) => {
      cachedPermissionStatus = s;
    },
  });
}

function createDefaultRequestAccess(): RequestCalendarAccess {
  return createRequestCalendarAccess({
    calendar: lazyCalendarPort(),
    publisher,
    getUiState: () => uiState,
    setUiState,
    setCachedPermission: (s) => {
      cachedPermissionStatus = s;
    },
  });
}

function createDefaultPermissionStatus(): GetCalendarPermissionStatus {
  return createGetCalendarPermissionStatus({
    calendar: lazyCalendarPort(),
    publisher,
    getCachedPermission: () => cachedPermissionStatus,
    setCachedPermission: (s) => {
      cachedPermissionStatus = s;
    },
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
      cachedProvider = null;
    },
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
  bindCalendarRefreshFetcher((signal) => _getMeetings.execute(signal));
}

/** Reset module-level defaults (tests / composition re-bind). */
export function rebindCalendarDefaults(): void {
  _getMeetings = createDefaultGetMeetings();
  _requestAccess = createDefaultRequestAccess();
  _permissionStatus = createDefaultPermissionStatus();
  _disconnect = createDefaultDisconnect();
  bindCalendarRefreshFetcher((signal) => _getMeetings.execute(signal));
}

// Ensure coordinator is wired on module load (production defaults).
bindCalendarRefreshFetcher((signal) => _getMeetings.execute(signal));

/** Synchronous snapshot for tray menu builders. */
export function getCalendarUiState(): CalendarUiState {
  return uiState;
}

/**
 * Coordinated refresh: single in-flight provider call + at most one follow-up.
 * Updates UI state via GetMeetings and returns the publication envelope.
 */
export async function refreshCalendarPublication(): Promise<CalendarPublication> {
  return requestCalendarRefresh();
}

/** Fetch calendar events through the coordinator (result only). */
export async function getCalendarEventsResult(_signal?: AbortSignal): Promise<CalendarResult> {
  const publication = await requestCalendarRefresh();
  return publication.result;
}

export function getLastPublication(): CalendarPublication | null {
  return getLastCalendarPublication();
}

export function cancelActiveCalendarRefresh(): void {
  cancelCalendarRefresh();
}

/** Test-only: reset facade + coordinator. */
export function _resetCalendarRefreshForTest(): void {
  _resetCalendarRefreshCoordinatorForTest();
  rebindCalendarDefaults();
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
 * `not-determined`. Darwin only — Windows must not auto-open OAuth.
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
    oauthConfigured: lazyCalendarPort().isOAuthConfigured?.() ?? false,
  });
  mainBus.emit("calendar-status-updated", uiState);
}

/**
 * Active provider as CalendarPort for watcher/startWatch (async resolve).
 * Prefer facades free functions for production call sites.
 */
export async function getCalendarPort(): Promise<CalendarPort> {
  return asCalendarPort(await resolveProvider());
}
