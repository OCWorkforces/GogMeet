/**
 * Calendar provider factory.
 *
 * Darwin always uses EventKit (K17). Non-Darwin uses the unsupported stub until
 * Wave 4 wires Google Calendar. Providers that touch Swift are loaded only via
 * dynamic import on Darwin so Windows never pulls in the Swift graph.
 */

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

  if (isDarwin()) {
    const { createDarwinEventKitProvider } = await import("./providers/darwin-eventkit.js");
    cached = createDarwinEventKitProvider();
    return cached;
  }

  const { createStubUnsupportedProvider } = await import("./providers/stub-unsupported.js");
  cached = createStubUnsupportedProvider();
  return cached;
}

/**
 * Drop the cached provider and stop any active watch.
 * Call after disconnect / provider setting changes (Wave 4+).
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
