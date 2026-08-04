/**
 * Packaged Windows safeStorage probe via real token + offline-cache adapters.
 * Synthetic values only; scan for plaintext marker after round-trips.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { asEventId, asIsoUtc } from "../../../domain/entities/brand.js";
import type { MeetingEvent } from "../../../domain/entities/meeting-event.js";
import {
  saveGoogleTokens,
  loadGoogleTokensResult,
  clearGoogleTokens,
} from "../../calendar/auth/google-token-store.js";
import {
  saveOfflineCache,
  loadOfflineCache,
  clearOfflineCache,
} from "../../calendar/offline-cache.js";
import { flushPerfTraceToUserData } from "../../utils/performance-trace-file.js";
import { perfTrace } from "../../utils/performance-trace.js";

const SYNTHETIC_MARKER = "SYN_PLAINTEXT_MARKER_NEVER_PERSIST";
const SYNTHETIC_CLIENT = "probe-client-id";

function syntheticTokens() {
  return {
    clientId: SYNTHETIC_CLIENT,
    accessToken: `access-${SYNTHETIC_MARKER}`,
    refreshToken: `refresh-${SYNTHETIC_MARKER}`,
    expiryMs: Date.now() + 3_600_000,
    email: "probe@local.test",
  };
}

function syntheticEvents(): MeetingEvent[] {
  const start = new Date(Date.now() + 60_000).toISOString();
  const end = new Date(Date.now() + 120_000).toISOString();
  const id = asEventId("syn-cache-1");
  const s = asIsoUtc(start);
  const e = asIsoUtc(end);
  if (!id.ok || !s.ok || !e.ok) return [];
  return [
    {
      id: id.value,
      title: `cache-${SYNTHETIC_MARKER}`,
      startDate: s.value,
      endDate: e.value,
      calendarName: "probe",
      isAllDay: false,
    },
  ];
}

function assertNoPlaintextInUserData(userDataPath: string): void {
  const paths = [
    join(userDataPath, "calendar-auth", "google.enc"),
    join(userDataPath, "calendar-cache.enc"),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const buf = readFileSync(p);
    if (buf.includes(Buffer.from(SYNTHETIC_MARKER))) {
      throw new Error(`plaintext marker found in ${p}`);
    }
  }
}

/**
 * Ten encrypted adapter round-trips + corrupt-ciphertext preservation check.
 */
export async function runSafeStorageProbe(userDataPath: string): Promise<void> {
  const cycles = 10;
  for (let i = 0; i < cycles; i++) {
    const t0 = performance.now();
    await saveGoogleTokens(syntheticTokens());
    const loaded = await loadGoogleTokensResult();
    if (loaded.kind !== "ok") {
      throw new Error(`token load failed: ${loaded.kind}`);
    }
    const events = syntheticEvents();
    await saveOfflineCache(events, Date.now());
    const cache = await loadOfflineCache();
    if (cache === null) {
      throw new Error("offline cache load returned null");
    }
    perfTrace({
      operation: "safe-storage",
      outcome: "ok",
      startMs: t0,
      durationMs: Math.max(0, performance.now() - t0),
      count: 1,
    });
  }

  assertNoPlaintextInUserData(userDataPath);

  // Corrupt ciphertext must not be unlinked (preserve bytes).
  const tokenPath = join(userDataPath, "calendar-auth", "google.enc");
  if (existsSync(tokenPath)) {
    const before = readFileSync(tokenPath);
    writeFileSync(tokenPath, Buffer.concat([before.subarray(0, 8), Buffer.from("CORRUPT")]));
    const afterCorrupt = readFileSync(tokenPath);
    const result = await loadGoogleTokensResult();
    if (result.kind === "ok") {
      throw new Error("corrupt ciphertext unexpectedly loaded ok");
    }
    const after = readFileSync(tokenPath);
    if (!after.equals(afterCorrupt)) {
      throw new Error("corrupt ciphertext was mutated on failed load");
    }
  }

  await clearGoogleTokens();
  await clearOfflineCache();
  flushPerfTraceToUserData(userDataPath);
}
