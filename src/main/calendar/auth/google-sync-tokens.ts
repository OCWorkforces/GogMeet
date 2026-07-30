/**
 * Encrypted per-calendar Google events.list nextSyncToken map.
 * Path: {userData}/calendar-auth/google-sync.enc
 * Does not store event bodies — only opaque sync tokens.
 */

import { app, safeStorage } from "electron";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { isObjectRecord } from "../../../domain/entities/type-guards.js";

export const GOOGLE_SYNC_SCHEMA_VERSION = 1 as const;

export interface GoogleSyncTokenFileV1 {
  readonly version: typeof GOOGLE_SYNC_SCHEMA_VERSION;
  /** calendarId → nextSyncToken from Google Calendar API */
  readonly tokens: Record<string, string>;
}

function authDir(): string {
  return join(app.getPath("userData"), "calendar-auth");
}

function syncPath(): string {
  return join(authDir(), "google-sync.enc");
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function allowPlaintextDev(): boolean {
  return !app.isPackaged && process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"] === "1";
}

function encode(json: string): Buffer {
  if (encryptionAvailable()) return safeStorage.encryptString(json);
  if (allowPlaintextDev()) return Buffer.from(json, "utf-8");
  throw new Error("OS secure storage unavailable for Google sync tokens");
}

function decode(buf: Buffer): string {
  if (encryptionAvailable()) return safeStorage.decryptString(buf);
  if (allowPlaintextDev()) return buf.toString("utf-8");
  throw new Error("OS secure storage unavailable for Google sync tokens");
}

export async function loadGoogleSyncTokens(): Promise<Record<string, string>> {
  try {
    const buf = await readFile(syncPath());
    const parsed: unknown = JSON.parse(decode(buf));
    if (!isObjectRecord(parsed) || parsed["version"] !== GOOGLE_SYNC_SCHEMA_VERSION) {
      return {};
    }
    const tokens = parsed["tokens"];
    if (!isObjectRecord(tokens)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(tokens)) {
      if (typeof v === "string" && v.length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveGoogleSyncTokens(tokens: Record<string, string>): Promise<void> {
  try {
    await mkdir(authDir(), { recursive: true });
    const payload: GoogleSyncTokenFileV1 = {
      version: GOOGLE_SYNC_SCHEMA_VERSION,
      tokens,
    };
    await writeFile(syncPath(), encode(JSON.stringify(payload)));
  } catch (err) {
    console.warn("[calendar:google-sync] Failed to persist sync tokens (redacted)");
    void err;
  }
}

export async function clearGoogleSyncToken(calendarId: string): Promise<void> {
  const tokens = await loadGoogleSyncTokens();
  if (!(calendarId in tokens)) return;
  const next = { ...tokens };
  delete next[calendarId];
  await saveGoogleSyncTokens(next);
}

export async function clearAllGoogleSyncTokens(): Promise<void> {
  try {
    await unlink(syncPath());
  } catch {
    // ignore missing
  }
}

export function googleSyncTokenFilePath(): string {
  return syncPath();
}
