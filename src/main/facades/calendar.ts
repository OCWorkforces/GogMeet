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

let cachedPermissionStatus: CalendarPermission | null = null;
let uiState: CalendarUiState = defaultCalendarUiState();

function publishUiState(partial: Partial<CalendarUiState>): void {
  uiState = { ...uiState, ...partial };
  mainBus.emit("calendar-status-updated", uiState);
}

/** Synchronous snapshot for tray menu builders. */
export function getCalendarUiState(): CalendarUiState {
  return uiState;
}

/** Fetch calendar events — returns structured result with events or error. */
export async function getCalendarEventsResult(): Promise<CalendarResult> {
  const provider = await getActiveCalendarProvider();
  const result = await provider.getEvents();

  if (result.kind === "ok") {
    const email = (await loadGoogleTokens())?.email ?? uiState.accountEmail;
    publishUiState({
      permission: "granted",
      phase: result.events.length === 0 ? "empty" : "ready",
      lastError: null,
      events: result.events,
      offline: false,
      accountEmail: email,
      oauthConfigured: isGoogleOAuthConfigured(),
    });
    cachedPermissionStatus = "granted";
  } else {
    const permission = await provider.getPermissionStatus().catch(() => "denied" as const);
    cachedPermissionStatus = permission;
    publishUiState({
      permission,
      phase: "error",
      lastError: result.error,
      oauthConfigured: isGoogleOAuthConfigured(),
    });
  }

  return result;
}

/**
 * Trigger permission flow for the active provider.
 * Darwin: Calendar.app AppleScript probe / TCC dialog.
 * Windows: OAuth when invoked from tray/Settings — not from lifecycle auto path.
 */
export async function requestCalendarPermission(): Promise<CalendarPermission> {
  publishUiState({
    phase: "connecting",
    lastError: null,
    oauthConfigured: isGoogleOAuthConfigured(),
  });

  const provider = await getActiveCalendarProvider();
  const status = await provider.requestPermission();
  cachedPermissionStatus = status;

  if (status === "granted") {
    const email = (await loadGoogleTokens())?.email ?? null;
    publishUiState({
      permission: "granted",
      phase: "ready",
      lastError: null,
      accountEmail: email,
      oauthConfigured: isGoogleOAuthConfigured(),
    });
  } else {
    publishUiState({
      permission: status,
      phase: status === "denied" ? "error" : "disconnected",
      lastError: status === "denied" ? "Google Calendar was not connected." : null,
      oauthConfigured: isGoogleOAuthConfigured(),
    });
  }

  return status;
}

/** Check current calendar permission state without triggering a new dialog when cached. */
export async function getCalendarPermissionStatus(): Promise<CalendarPermission> {
  if (isGoogleOAuthInFlight()) return "not-determined";
  if (cachedPermissionStatus !== null) return cachedPermissionStatus;
  const provider = await getActiveCalendarProvider();
  cachedPermissionStatus = await provider.getPermissionStatus();

  publishUiState({
    permission: cachedPermissionStatus,
    phase:
      cachedPermissionStatus === "granted"
        ? uiState.events && uiState.events.length > 0
          ? "ready"
          : "empty"
        : "disconnected",
    oauthConfigured: isGoogleOAuthConfigured(),
    accountEmail: (await loadGoogleTokens())?.email ?? uiState.accountEmail,
  });

  return cachedPermissionStatus;
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
  const provider = await getActiveCalendarProvider();
  await provider.warmup?.();
}

/** Disconnect Google / reset provider. Clears permission cache and UI state. */
export async function disconnectCalendar(): Promise<void> {
  const provider = await getActiveCalendarProvider();
  await provider.disconnect?.();
  resetCalendarProvider();
  cachedPermissionStatus = null;
  publishUiState({
    ...defaultCalendarUiState(),
    oauthConfigured: isGoogleOAuthConfigured(),
    phase: "disconnected",
    permission: "not-determined",
  });
}

/** Apply a poll-level error while optionally retaining last events for offline UI. */
export function reportCalendarPollError(error: string, lastEvents: MeetingEvent[] | null): void {
  publishUiState({
    phase: lastEvents && lastEvents.length > 0 ? "offline-cached" : "error",
    lastError: error,
    events: lastEvents,
    offline: !!(lastEvents && lastEvents.length > 0),
    oauthConfigured: isGoogleOAuthConfigured(),
  });
}
