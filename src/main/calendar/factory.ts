/**
 * Calendar provider factory.
 *
 * Order:
 * 1. Dev fixture when unpackaged + GOGMEET_CALENDAR_FIXTURE (K23)
 * 2. Darwin → EventKit (K17)
 * 3. Else → Google Calendar (Windows MVP)
 *
 * Providers that touch Swift are loaded only via dynamic import on Darwin so
 * Windows never pulls in the Swift graph.
 */

import { app } from "electron";

import { isDarwin } from "../platform/os.js";
import type { CalendarProvider } from "./provider.js";

let cached: CalendarProvider | null = null;

/**
 * Resolve (and cache) the active calendar provider for this process.
 */
export async function getActiveCalendarProvider(): Promise<CalendarProvider> {
  if (cached !== null) {
    return cached;
  }

  // K23: fixture only when unpackaged AND env path set — never in packaged builds
  const fixturePath = process.env["GOGMEET_CALENDAR_FIXTURE"];
  if (!app.isPackaged && typeof fixturePath === "string" && fixturePath.trim().length > 0) {
    const { createFixtureCalendarProvider } = await import("./providers/fixture-calendar.js");
    cached = createFixtureCalendarProvider(fixturePath.trim());
    console.log(`[calendar:factory] Using fixture provider: ${fixturePath.trim()}`);
    return cached;
  }

  if (isDarwin()) {
    const { createDarwinEventKitProvider } = await import("./providers/darwin-eventkit.js");
    cached = createDarwinEventKitProvider();
    return cached;
  }

  const { createGoogleCalendarProvider } = await import("./providers/google-calendar.js");
  cached = createGoogleCalendarProvider();
  return cached;
}

/**
 * Drop the cached provider and stop any active watch.
 * Call after disconnect / provider setting changes.
 */
export function resetCalendarProvider(): void {
  if (cached !== null) {
    try {
      cached.stopWatch?.();
    } catch (err) {
      console.warn("[calendar:factory] stopWatch during reset failed:", err);
    }
  }
  cached = null;
}

/** Test-only: inject a provider without going through platform selection. */
export function _setCalendarProviderForTest(provider: CalendarProvider | null): void {
  cached = provider;
}
