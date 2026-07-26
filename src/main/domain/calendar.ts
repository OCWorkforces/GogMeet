import type { CalendarPermission, CalendarResult } from "../../shared/calendar-result.js";
import { getActiveCalendarProvider, resetCalendarProvider } from "../calendar/factory.js";
import { isDarwin } from "../platform/os.js";

let cachedPermissionStatus: CalendarPermission | null = null;

/** Fetch calendar events — returns structured result with events or error. */
export async function getCalendarEventsResult(): Promise<CalendarResult> {
  const provider = await getActiveCalendarProvider();
  return provider.getEvents();
}

/**
 * Trigger permission flow for the active provider.
 * Darwin: Calendar.app AppleScript probe / TCC dialog.
 * Windows (Wave 4): OAuth when invoked from tray/Settings — not from lifecycle auto path.
 */
export async function requestCalendarPermission(): Promise<CalendarPermission> {
  const provider = await getActiveCalendarProvider();
  const status = await provider.requestPermission();
  cachedPermissionStatus = status;
  return status;
}

/** Check current calendar permission state without triggering a new dialog when cached. */
export async function getCalendarPermissionStatus(): Promise<CalendarPermission> {
  if (cachedPermissionStatus !== null) return cachedPermissionStatus;
  const provider = await getActiveCalendarProvider();
  cachedPermissionStatus = await provider.getPermissionStatus();
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

/** Pre-warm the active provider (Swift compile on Darwin). Non-blocking when called with void. */
export async function warmupCalendarProvider(): Promise<void> {
  const provider = await getActiveCalendarProvider();
  await provider.warmup?.();
}

/** Disconnect / reset provider (Wave 4+ tray CTA). Clears permission cache. */
export async function disconnectCalendar(): Promise<void> {
  const provider = await getActiveCalendarProvider();
  await provider.disconnect?.();
  resetCalendarProvider();
  cachedPermissionStatus = null;
}
