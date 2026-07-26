/**
 * Encrypted offline calendar event cache (K29).
 * Path: {userData}/calendar-cache.enc
 */

import { app, safeStorage } from "electron";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { MeetingEvent } from "../../shared/meeting-event.js";
import { isObjectRecord } from "../../shared/type-guards.js";
import { asEventId, asIsoUtc, asMeetUrl } from "../../shared/brand.js";

export interface OfflineCachePayload {
  readonly savedAt: number;
  readonly events: MeetingEvent[];
}

function cachePath(): string {
  return join(app.getPath("userData"), "calendar-cache.enc");
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

export async function loadOfflineCache(): Promise<OfflineCachePayload | null> {
  try {
    const buf = await readFile(cachePath());
    const json = decode(buf);
    const parsed: unknown = JSON.parse(json);
    if (!isObjectRecord(parsed) || typeof parsed["savedAt"] !== "number") return null;
    if (!Array.isArray(parsed["events"])) return null;
    const events: MeetingEvent[] = [];
    for (const item of parsed["events"]) {
      const mapped = mapEvent(item);
      if (mapped) events.push(mapped);
    }
    return { savedAt: parsed["savedAt"], events };
  } catch {
    return null;
  }
}

export async function saveOfflineCache(events: MeetingEvent[]): Promise<void> {
  try {
    const payload: OfflineCachePayload = { savedAt: Date.now(), events };
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
