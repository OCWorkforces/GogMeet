import { app } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "path";
import {
  DEFAULT_SETTINGS,
  OPEN_BEFORE_MINUTES_MIN,
  OPEN_BEFORE_MINUTES_MAX,
  ALERT_LEAD_SECONDS_MIN,
  ALERT_LEAD_SECONDS_MAX,
  LATE_JOIN_GRACE_MINUTES_MIN,
  LATE_JOIN_GRACE_MINUTES_MAX,
  SETTINGS_SCHEMA_VERSION,
  isHHmm,
} from "../../shared/settings.js";
import type { AppSettings } from "../../shared/settings.js";
import { ok, err } from "../../shared/result.js";
import type { Result, AppResult } from "../../shared/result.js";
import { parseJsonObject } from "../../shared/parse-json.js";
import { isObjectRecord } from "../../shared/type-guards.js";
import { formatAppError, isValidationError } from "../../shared/errors.js";

let settingsCache: AppSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

function getSettingsPath(): string {
  const userDataPath = app.getPath("userData");
  return join(userDataPath, "settings.json");
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isEnoent(e: unknown): e is { code: unknown } {
  return isObjectRecord(e) && e["code"] === "ENOENT";
}

function parseSettingsRecord(parsed: Record<string, unknown>): AppSettings {
  // Migrate legacy fullScreenAlert → windowAlert
  if (
    typeof parsed["fullScreenAlert"] === "boolean" &&
    typeof parsed["windowAlert"] !== "boolean"
  ) {
    parsed["windowAlert"] = parsed["fullScreenAlert"];
  }

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    openBeforeMinutes: clamp(
      typeof parsed["openBeforeMinutes"] === "number"
        ? parsed["openBeforeMinutes"]
        : DEFAULT_SETTINGS.openBeforeMinutes,
      OPEN_BEFORE_MINUTES_MIN,
      OPEN_BEFORE_MINUTES_MAX,
    ),
    launchAtLogin:
      typeof parsed["launchAtLogin"] === "boolean"
        ? parsed["launchAtLogin"]
        : DEFAULT_SETTINGS.launchAtLogin,
    showTomorrowMeetings:
      typeof parsed["showTomorrowMeetings"] === "boolean"
        ? parsed["showTomorrowMeetings"]
        : DEFAULT_SETTINGS.showTomorrowMeetings,
    windowAlert:
      typeof parsed["windowAlert"] === "boolean"
        ? parsed["windowAlert"]
        : DEFAULT_SETTINGS.windowAlert,
    autoOpenEnabled:
      typeof parsed["autoOpenEnabled"] === "boolean"
        ? parsed["autoOpenEnabled"]
        : DEFAULT_SETTINGS.autoOpenEnabled,
    alertLeadSeconds: clamp(
      typeof parsed["alertLeadSeconds"] === "number"
        ? parsed["alertLeadSeconds"]
        : DEFAULT_SETTINGS.alertLeadSeconds,
      ALERT_LEAD_SECONDS_MIN,
      ALERT_LEAD_SECONDS_MAX,
    ),
    nativeNotifications:
      typeof parsed["nativeNotifications"] === "boolean"
        ? parsed["nativeNotifications"]
        : DEFAULT_SETTINGS.nativeNotifications,
    lateJoinGraceMinutes: clamp(
      typeof parsed["lateJoinGraceMinutes"] === "number"
        ? parsed["lateJoinGraceMinutes"]
        : DEFAULT_SETTINGS.lateJoinGraceMinutes,
      LATE_JOIN_GRACE_MINUTES_MIN,
      LATE_JOIN_GRACE_MINUTES_MAX,
    ),
    quietHoursEnabled:
      typeof parsed["quietHoursEnabled"] === "boolean"
        ? parsed["quietHoursEnabled"]
        : DEFAULT_SETTINGS.quietHoursEnabled,
    quietHoursStart:
      typeof parsed["quietHoursStart"] === "string" && isHHmm(parsed["quietHoursStart"])
        ? parsed["quietHoursStart"]
        : DEFAULT_SETTINGS.quietHoursStart,
    quietHoursEnd:
      typeof parsed["quietHoursEnd"] === "string" && isHHmm(parsed["quietHoursEnd"])
        ? parsed["quietHoursEnd"]
        : DEFAULT_SETTINGS.quietHoursEnd,
  };
}

export async function loadSettings(): Promise<Result<AppSettings, string>> {
  const settingsPath = getSettingsPath();

  let raw: string;
  try {
    raw = await readFile(settingsPath, "utf-8");
  } catch (e) {
    if (isEnoent(e)) {
      settingsCache = { ...DEFAULT_SETTINGS };
      settingsLoaded = true;
      return ok(settingsCache);
    }
    settingsCache = { ...DEFAULT_SETTINGS };
    settingsLoaded = true;
    return err(`Failed to read settings file: ${e instanceof Error ? e.message : String(e)}`);
  }

  const parsedResult = parseJsonObject<Record<string, unknown>>(
    raw,
    "settings.json",
    (value): AppResult<Record<string, unknown>> => ({ ok: true, value }),
  );
  if (!parsedResult.ok) {
    settingsCache = { ...DEFAULT_SETTINGS };
    settingsLoaded = true;
    const detail = isValidationError(parsedResult.error)
      ? parsedResult.error.message
      : formatAppError(parsedResult.error);
    return err(`Failed to parse settings JSON: ${detail}`);
  }

  const previousVersion =
    typeof parsedResult.value["schemaVersion"] === "number"
      ? parsedResult.value["schemaVersion"]
      : 1;
  settingsCache = parseSettingsRecord(parsedResult.value);
  settingsLoaded = true;

  // Rewrite on migrate so disk always reflects schemaVersion 2
  if (previousVersion < SETTINGS_SCHEMA_VERSION) {
    try {
      await saveSettings(settingsCache);
    } catch (e) {
      console.warn("[settings] Failed to rewrite migrated settings:", e);
    }
  }

  return ok(settingsCache);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const userDataPath = app.getPath("userData");
  await mkdir(userDataPath, { recursive: true });
  const settingsPath = getSettingsPath();
  const raw = JSON.stringify(settings, null, 2);
  await writeFile(settingsPath, raw, "utf-8");
}

export function getSettings(): AppSettings {
  if (!settingsLoaded) {
    throw new Error(
      "Settings not loaded — loadSettings() must be called during app initialization",
    );
  }
  return { ...settingsCache };
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  if (!settingsLoaded) {
    throw new Error(
      "Settings not loaded — loadSettings() must be called during app initialization",
    );
  }
  const merged: AppSettings = { ...settingsCache };

  if (typeof partial.openBeforeMinutes === "number") {
    merged.openBeforeMinutes = clamp(
      partial.openBeforeMinutes,
      OPEN_BEFORE_MINUTES_MIN,
      OPEN_BEFORE_MINUTES_MAX,
    );
  }
  if (typeof partial.launchAtLogin === "boolean") {
    merged.launchAtLogin = partial.launchAtLogin;
  }
  if (typeof partial.showTomorrowMeetings === "boolean") {
    merged.showTomorrowMeetings = partial.showTomorrowMeetings;
  }
  if (typeof partial.windowAlert === "boolean") {
    merged.windowAlert = partial.windowAlert;
  }
  if (typeof partial.autoOpenEnabled === "boolean") {
    merged.autoOpenEnabled = partial.autoOpenEnabled;
  }
  if (typeof partial.alertLeadSeconds === "number") {
    merged.alertLeadSeconds = clamp(
      partial.alertLeadSeconds,
      ALERT_LEAD_SECONDS_MIN,
      ALERT_LEAD_SECONDS_MAX,
    );
  }
  if (typeof partial.nativeNotifications === "boolean") {
    merged.nativeNotifications = partial.nativeNotifications;
  }
  if (typeof partial.lateJoinGraceMinutes === "number") {
    merged.lateJoinGraceMinutes = clamp(
      partial.lateJoinGraceMinutes,
      LATE_JOIN_GRACE_MINUTES_MIN,
      LATE_JOIN_GRACE_MINUTES_MAX,
    );
  }
  if (typeof partial.quietHoursEnabled === "boolean") {
    merged.quietHoursEnabled = partial.quietHoursEnabled;
  }
  if (typeof partial.quietHoursStart === "string" && isHHmm(partial.quietHoursStart)) {
    merged.quietHoursStart = partial.quietHoursStart;
  }
  if (typeof partial.quietHoursEnd === "string" && isHHmm(partial.quietHoursEnd)) {
    merged.quietHoursEnd = partial.quietHoursEnd;
  }

  merged.schemaVersion = SETTINGS_SCHEMA_VERSION;
  await saveSettings(merged);
  settingsCache = { ...merged };
  return getSettings();
}
