/**
 * Encrypted offline calendar event cache.
 * Path: {userData}/calendar-cache.enc
 *
 * Schema v1: { version:1, observedAt, cachedAt, events }.
 * Only complete live snapshots should be written by callers.
 * Load rejects unversioned/unknown/corrupt/future metadata and filters ended events.
 */

import { app, safeStorage } from "electron";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import { isValidCalendarTimestamp } from "../../domain/entities/calendar-result.js";
import { isObjectRecord } from "../../domain/entities/type-guards.js";
import { asEventId, asIsoUtc, asMeetUrl } from "../../domain/entities/brand.js";

export const OFFLINE_CACHE_SCHEMA_VERSION = 1 as const;

export interface OfflineCachePayload {
  readonly version: typeof OFFLINE_CACHE_SCHEMA_VERSION;
  /** Observation time of the live complete snapshot that was cached. */
  readonly observedAt: number;
  /** Cache write time. */
  readonly cachedAt: number;
  readonly events: MeetingEvent[];
}

function cachePath(): string {
  return join(app.getPath("userData"), "calendar-cache.enc");
}

/** Absolute path for tests / diagnostics. */
export function offlineCacheFilePath(): string {
  return cachePath();
}

function allowPlaintextDev(): boolean {
  return !app.isPackaged && process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"] === "1";
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encode(json: string): Buffer {
  if (encryptionAvailable()) return safeStorage.encryptString(json);
  if (allowPlaintextDev()) return Buffer.from(json, "utf-8");
  throw new Error("OS secure storage unavailable for calendar cache");
}

function decode(buf: Buffer): string {
  if (encryptionAvailable()) return safeStorage.decryptString(buf);
  if (allowPlaintextDev()) return buf.toString("utf-8");
  throw new Error("OS secure storage unavailable for calendar cache");
}

function mapEvent(raw: unknown): MeetingEvent | null {
  if (!isObjectRecord(raw)) return null;
  if (typeof raw["id"] !== "string" || typeof raw["title"] !== "string") return null;
  if (typeof raw["startDate"] !== "string" || typeof raw["endDate"] !== "string") return null;
  if (typeof raw["calendarName"] !== "string" || typeof raw["isAllDay"] !== "boolean") {
    return null;
  }
  const id = asEventId(raw["id"]);
  const start = asIsoUtc(raw["startDate"]);
  const end = asIsoUtc(raw["endDate"]);
  if (!id.ok || !start.ok || !end.ok) return null;

  const event: MeetingEvent = {
    id: id.value,
    title: raw["title"],
    startDate: start.value,
    endDate: end.value,
    calendarName: raw["calendarName"],
    isAllDay: raw["isAllDay"],
  };

  if (typeof raw["meetUrl"] === "string" && raw["meetUrl"].length > 0) {
    const u = asMeetUrl(raw["meetUrl"]);
    if (u.ok) event.meetUrl = u.value;
  }
  if (typeof raw["userEmail"] === "string" && raw["userEmail"].length > 0) {
    event.userEmail = raw["userEmail"];
  }
  if (typeof raw["description"] === "string" && raw["description"].length > 0) {
    event.description = raw["description"];
  }
  return event;
}

function filterActiveEvents(events: MeetingEvent[], nowMs: number): MeetingEvent[] {
  return events.filter((e) => {
    const endMs = new Date(e.endDate).getTime();
    return Number.isFinite(endMs) && endMs > nowMs;
  });
}

/**
 * Load and validate cache. Returns null for missing, corrupt, unversioned,
 * unknown-version, non-finite, or >5-minute-future timestamps (fail closed).
 * Ended events (`endDate <= now`) are filtered; empty list is still a valid hit.
 */
export async function loadOfflineCache(
  nowMs: number = Date.now(),
): Promise<OfflineCachePayload | null> {
  try {
    const buf = await readFile(cachePath());
    const json = decode(buf);
    const parsed: unknown = JSON.parse(json);
    if (!isObjectRecord(parsed)) return null;

    // Reject unversioned / legacy {savedAt,events} and unknown versions.
    if (parsed["version"] !== OFFLINE_CACHE_SCHEMA_VERSION) return null;
    if (typeof parsed["observedAt"] !== "number" || typeof parsed["cachedAt"] !== "number") {
      return null;
    }
    if (!isValidCalendarTimestamp(parsed["observedAt"], nowMs)) return null;
    if (!isValidCalendarTimestamp(parsed["cachedAt"], nowMs)) return null;
    if (!Array.isArray(parsed["events"])) return null;

    const events: MeetingEvent[] = [];
    for (const item of parsed["events"]) {
      const mapped = mapEvent(item);
      if (mapped) events.push(mapped);
    }

    return {
      version: OFFLINE_CACHE_SCHEMA_VERSION,
      observedAt: parsed["observedAt"],
      cachedAt: parsed["cachedAt"],
      events: filterActiveEvents(events, nowMs),
    };
  } catch {
    return null;
  }
}

/**
 * Persist a complete live snapshot. Callers must only pass complete results.
 * @param observedAt completion time of the live aggregation
 */
export async function saveOfflineCache(
  events: MeetingEvent[],
  observedAt: number = Date.now(),
): Promise<void> {
  try {
    const now = Date.now();
    if (!isValidCalendarTimestamp(observedAt, now)) {
      console.warn("[calendar:cache] Refusing to save cache with invalid observedAt");
      return;
    }
    const payload: OfflineCachePayload = {
      version: OFFLINE_CACHE_SCHEMA_VERSION,
      observedAt,
      cachedAt: now,
      events,
    };
    const path = cachePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, encode(JSON.stringify(payload)));
  } catch (err) {
    console.warn("[calendar:cache] Failed to save offline cache:", err);
  }
}

export async function clearOfflineCache(): Promise<void> {
  try {
    await unlink(cachePath());
  } catch {
    // ignore
  }
}
