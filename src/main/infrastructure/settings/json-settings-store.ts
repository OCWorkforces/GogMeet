import { app } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
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
  type AppSettings,
} from "../../../domain/entities/settings.js";
import { ok, err, type Result, type AppResult } from "../../../domain/entities/result.js";
import { parseJsonObject } from "../../../domain/entities/parse-json.js";
import { isObjectRecord } from "../../../domain/entities/type-guards.js";
import { formatAppError, isValidationError } from "../../../domain/entities/errors.js";
import { parseSettingsRecord } from "../../../domain/services/settings-parse.js";
import type { SettingsStorePort } from "../../application/ports/settings-store-port.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isEnoent(e: unknown): e is { code: unknown } {
  return isObjectRecord(e) && e["code"] === "ENOENT";
}

export interface JsonSettingsStore extends SettingsStorePort {
  /** Persist full settings blob (tests / migration rewrite). */
  save(settings: AppSettings): Promise<void>;
}

/**
 * FS-backed settings store under Electron userData/settings.json.
 */
export function createJsonSettingsStore(): JsonSettingsStore {
  let settingsCache: AppSettings = { ...DEFAULT_SETTINGS };
  let settingsLoaded = false;

  function getSettingsPath(): string {
    return join(app.getPath("userData"), "settings.json");
  }

  async function saveInternal(settings: AppSettings): Promise<void> {
    const userDataPath = app.getPath("userData");
    await mkdir(userDataPath, { recursive: true });
    await writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), "utf-8");
  }

  return {
    async load(): Promise<Result<AppSettings, string>> {
      let raw: string;
      try {
        raw = await readFile(getSettingsPath(), "utf-8");
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

      if (previousVersion < SETTINGS_SCHEMA_VERSION) {
        try {
          await saveInternal(settingsCache);
        } catch (e) {
          console.warn("[settings] Failed to rewrite migrated settings:", e);
        }
      }

      return ok(settingsCache);
    },

    get(): AppSettings {
      if (!settingsLoaded) {
        throw new Error(
          "Settings not loaded — loadSettings() must be called during app initialization",
        );
      }
      return { ...settingsCache };
    },

    async update(partial: Partial<AppSettings>): Promise<AppSettings> {
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
      if (typeof partial.showCompletedTodayMeetings === "boolean") {
        merged.showCompletedTodayMeetings = partial.showCompletedTodayMeetings;
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
      await saveInternal(merged);
      settingsCache = { ...merged };
      return { ...settingsCache };
    },

    async save(settings: AppSettings): Promise<void> {
      await saveInternal(settings);
      settingsCache = { ...settings };
      settingsLoaded = true;
    },
  };
}
