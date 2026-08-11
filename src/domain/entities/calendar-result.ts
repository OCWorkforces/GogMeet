import type { MeetingEvent } from "./meeting-event.js";

export interface DarwinPartialRefreshDiagnostics {
  readonly total: number;
  readonly malformedRecord: number;
  readonly malformedFieldCount: number;
  readonly invalidIso: number;
  readonly invalidId: number;
  readonly duplicateUid: number;
}

/**
 * CalendarResult — domain result for calendar fetches (EventKit / Google / fixture).
 *
 * Intentionally diverges from the generic `Result<T,E>` in result.ts:
 *  - Uses `kind: "ok"|"err"` with an `isCalendarOk()` guard.
 *  - Success is exhaustive on source/completeness so callers never guess provenance.
 *
 * Do not collapse into `Result<MeetingEvent[], CalendarError>`: the shape is a
 * stable contract across providers, IPC, and the renderer.
 */

/** Successful live aggregation (complete or partial). */
export interface CalendarResultOkLive {
  readonly kind: "ok";
  readonly source: "live";
  readonly completeness: "complete" | "partial";
  /** Completion time of the successful live aggregation that produced the snapshot. */
  readonly observedAt: number;
  readonly events: MeetingEvent[];
  readonly darwinPartialRefreshDiagnostics?: DarwinPartialRefreshDiagnostics;
}

/** Successful offline-cache read. */
export interface CalendarResultOkOffline {
  readonly kind: "ok";
  readonly source: "offline-cache";
  /** Original observation time from the live snapshot that was cached. */
  readonly observedAt: number;
  /** Cache-write time. */
  readonly cachedAt: number;
  readonly events: MeetingEvent[];
}

/** Successful calendar fetch — exhaustive provenance. */
export type CalendarResultOk = CalendarResultOkLive | CalendarResultOkOffline;

/** Stable error codes for calendar fetch failures. */
export type CalendarErrorCode = "permission-denied" | "no-calendars" | "runtime" | "unknown";

/** Failed calendar fetch — error message and structured code for UI branching. */
export interface CalendarResultErr {
  readonly kind: "err";
  readonly error: string;
  /** Required structured code so UI can distinguish permission vs runtime failures. */
  readonly code: CalendarErrorCode;
}

/** Structured result from calendar fetch — discriminated union on `kind`. */
export type CalendarResult = CalendarResultOk | CalendarResultErr;

/** Type guard: narrows CalendarResult to any successful variant. */
export function isCalendarOk(result: CalendarResult): result is CalendarResultOk {
  return result.kind === "ok";
}

export function isCalendarLiveOk(result: CalendarResult): result is CalendarResultOkLive {
  return result.kind === "ok" && result.source === "live";
}

export function isCalendarOfflineOk(result: CalendarResult): result is CalendarResultOkOffline {
  return result.kind === "ok" && result.source === "offline-cache";
}

/** True when automation may arm (live complete only). Degraded data is display/join only. */
export function isCalendarAutomationEligible(result: CalendarResult): boolean {
  return result.kind === "ok" && result.source === "live" && result.completeness === "complete";
}

const MAX_FUTURE_SKEW_MS = 5 * 60_000;

/** Validate observation/cache timestamps: finite and not more than 5 minutes in the future. */
export function isValidCalendarTimestamp(ms: number, nowMs: number = Date.now()): boolean {
  return Number.isFinite(ms) && ms <= nowMs + MAX_FUTURE_SKEW_MS;
}

export function calendarLiveOk(
  events: MeetingEvent[],
  completeness: "complete" | "partial",
  observedAt: number = Date.now(),
  darwinPartialRefreshDiagnostics?: DarwinPartialRefreshDiagnostics,
): CalendarResultOkLive {
  return {
    kind: "ok",
    source: "live",
    completeness,
    observedAt,
    events,
    ...(darwinPartialRefreshDiagnostics ? { darwinPartialRefreshDiagnostics } : {}),
  };
}

export function calendarOfflineOk(
  events: MeetingEvent[],
  observedAt: number,
  cachedAt: number,
): CalendarResultOkOffline {
  return {
    kind: "ok",
    source: "offline-cache",
    observedAt,
    cachedAt,
    events,
  };
}

export function calendarErr(error: string, code: CalendarErrorCode): CalendarResultErr {
  return { kind: "err", error, code };
}

/** Calendar permission states */
export type CalendarPermission = "granted" | "denied" | "not-determined";
