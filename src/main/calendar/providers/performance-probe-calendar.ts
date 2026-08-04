/**
 * Private packaged measurement calendar provider.
 * Live complete empty events, granted permission, no watch, no I/O.
 * Selected only after probe preflight validation (never for normal product).
 */

import type {
  CalendarPermission,
  CalendarResult,
} from "../../../domain/entities/calendar-result.js";
import { calendarLiveOk } from "../../../domain/entities/calendar-result.js";
import type { CalendarProvider } from "../provider.js";

export function createPerformanceProbeCalendarProvider(): CalendarProvider {
  return {
    // Distinct from unpackaged fixture selection; union reuses "fixture" slot until provider id expands.
    id: "fixture",
    async getEvents(_signal: AbortSignal): Promise<CalendarResult> {
      return calendarLiveOk([], "complete", Date.now());
    },
    async getPermissionStatus(): Promise<CalendarPermission> {
      return "granted";
    },
    async requestPermission(): Promise<CalendarPermission> {
      return "granted";
    },
    async disconnect(): Promise<void> {
      // no-op — no tokens/cache
    },
    async getAccountLabel(): Promise<string | null> {
      return "perf-probe@local";
    },
    isOAuthConfigured(): boolean {
      return true;
    },
    isOAuthInFlight(): boolean {
      return false;
    },
    async warmup(): Promise<void> {
      // no-op
    },
    // intentionally no startWatch / stopWatch / reviveWatch
  };
}
