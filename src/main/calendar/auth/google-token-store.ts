/**
 * Encrypted Google OAuth token persistence (K27, K29 patterns).
 * Path: {userData}/calendar-auth/google.enc
 */

import { app, safeStorage } from "electron";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import { isObjectRecord } from "../../../shared/type-guards.js";
import { getGoogleOAuthClientId } from "./google-client-id.js";

export const GOOGLE_AUTH_SCHEMA_VERSION = 1 as const;

export interface GoogleTokenFileV1 {
  readonly authSchemaVersion: typeof GOOGLE_AUTH_SCHEMA_VERSION;
  readonly clientId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiryMs: number;
  readonly email?: string;
  readonly scope?: string;
}

function authDir(): string {
  return join(app.getPath("userData"), "calendar-auth");
}

function tokenPath(): string {
  return join(authDir(), "google.enc");
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

function encodePayload(json: string): Buffer {
  if (encryptionAvailable()) {
    return safeStorage.encryptString(json);
  }
  if (allowPlaintextDev()) {
    return Buffer.from(json, "utf-8");
  }
  throw new Error("OS secure storage is unavailable; cannot store Google OAuth tokens");
}

function decodePayload(buf: Buffer): string {
  if (encryptionAvailable()) {
    return safeStorage.decryptString(buf);
  }
  if (allowPlaintextDev()) {
    return buf.toString("utf-8");
  }
  throw new Error("OS secure storage is unavailable; cannot read Google OAuth tokens");
}

function parseTokenFile(raw: unknown): GoogleTokenFileV1 | null {
  if (!isObjectRecord(raw)) return null;
  if (raw["authSchemaVersion"] !== GOOGLE_AUTH_SCHEMA_VERSION) return null;
  if (typeof raw["clientId"] !== "string" || raw["clientId"].length === 0) return null;
  if (typeof raw["accessToken"] !== "string" || raw["accessToken"].length === 0) return null;
  if (typeof raw["refreshToken"] !== "string" || raw["refreshToken"].length === 0) return null;
  if (typeof raw["expiryMs"] !== "number" || !Number.isFinite(raw["expiryMs"])) return null;

  const expectedClientId = getGoogleOAuthClientId();
  if (expectedClientId.length > 0 && raw["clientId"] !== expectedClientId) {
    return null;
  }

  const base: GoogleTokenFileV1 = {
    authSchemaVersion: GOOGLE_AUTH_SCHEMA_VERSION,
    clientId: raw["clientId"],
    accessToken: raw["accessToken"],
    refreshToken: raw["refreshToken"],
    expiryMs: raw["expiryMs"],
  };

  const email = raw["email"];
  const scope = raw["scope"];
  return {
    ...base,
    ...(typeof email === "string" && email.length > 0 ? { email } : {}),
    ...(typeof scope === "string" && scope.length > 0 ? { scope } : {}),
  };
}

/** Load tokens or null if missing/invalid (invalid files are deleted). */
export async function loadGoogleTokens(): Promise<GoogleTokenFileV1 | null> {
  let buf: Buffer;
  try {
    buf = await readFile(tokenPath());
  } catch {
    return null;
  }

  try {
    const json = decodePayload(buf);
    const parsed: unknown = JSON.parse(json);
    const tokens = parseTokenFile(parsed);
    if (tokens === null) {
      await clearGoogleTokens();
      return null;
    }
    return tokens;
  } catch (err) {
    console.warn("[calendar:auth] Failed to load tokens; clearing:", err);
    await clearGoogleTokens();
    return null;
  }
}

/** Persist tokens (encrypted when available). */
export async function saveGoogleTokens(
  tokens: Omit<GoogleTokenFileV1, "authSchemaVersion" | "clientId"> & {
    clientId?: string;
  },
): Promise<void> {
  const clientId = tokens.clientId ?? getGoogleOAuthClientId();
  if (clientId.length === 0) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured");
  }

  const payload: GoogleTokenFileV1 = {
    authSchemaVersion: GOOGLE_AUTH_SCHEMA_VERSION,
    clientId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiryMs: tokens.expiryMs,
    ...(tokens.email !== undefined ? { email: tokens.email } : {}),
    ...(tokens.scope !== undefined ? { scope: tokens.scope } : {}),
  };

  await mkdir(authDir(), { recursive: true });
  const encoded = encodePayload(JSON.stringify(payload));
  await writeFile(tokenPath(), encoded);
}

/** Delete token file if present. */
export async function clearGoogleTokens(): Promise<void> {
  try {
    await unlink(tokenPath());
  } catch {
    // ignore missing
  }
}
