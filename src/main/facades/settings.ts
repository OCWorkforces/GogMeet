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
} from "../../domain/entities/settings.js";
import type { AppSettings } from "../../domain/entities/settings.js";
import { ok, err } from "../../domain/entities/result.js";
import type { Result, AppResult } from "../../domain/entities/result.js";
import { parseJsonObject } from "../../domain/entities/parse-json.js";
import { isObjectRecord } from "../../domain/entities/type-guards.js";
import { formatAppError, isValidationError } from "../../domain/entities/errors.js";
import { parseSettingsRecord } from "../../domain/services/settings-parse.js";
import type { SettingsStorePort } from "../application/ports/settings-store-port.js";
import { createLoadSettings, type LoadSettings } from "../application/use-cases/load-settings.js";
import {
  createUpdateSettings,
  type UpdateSettings,
} from "../application/use-cases/update-settings.js";
import { createGetSettings, type GetSettings } from "../application/use-cases/get-settings.js";

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

/**
 * FS-backed SettingsStorePort (may move under infrastructure later).
 * Algorithm for load/update remains here as the adapter body.
 */
export function createFileSettingsStore(): SettingsStorePort {
  return {
    async load(): Promise<Result<AppSettings, string>> {
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

      if (previousVersion < SETTINGS_SCHEMA_VERSION) {
        try {
          await saveSettingsInternal(settingsCache);
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
      await saveSettingsInternal(merged);
      settingsCache = { ...merged };
      return { ...settingsCache };
    },
  };
}

async function saveSettingsInternal(settings: AppSettings): Promise<void> {
  const userDataPath = app.getPath("userData");
  await mkdir(userDataPath, { recursive: true });
  const settingsPath = getSettingsPath();
  const raw = JSON.stringify(settings, null, 2);
  await writeFile(settingsPath, raw, "utf-8");
}

const defaultStore = createFileSettingsStore();

let _load: LoadSettings = createLoadSettings(defaultStore);
let _update: UpdateSettings = createUpdateSettings(defaultStore);
let _get: GetSettings = createGetSettings(defaultStore);

/** Test / composition override. */
export function bindSettingsUseCases(bindings: {
  load?: LoadSettings;
  update?: UpdateSettings;
  get?: GetSettings;
  store?: SettingsStorePort;
}): void {
  if (bindings.store) {
    _load = createLoadSettings(bindings.store);
    _update = createUpdateSettings(bindings.store);
    _get = createGetSettings(bindings.store);
    return;
  }
  if (bindings.load) _load = bindings.load;
  if (bindings.update) _update = bindings.update;
  if (bindings.get) _get = bindings.get;
}

export function rebindSettingsDefaults(): void {
  const store = createFileSettingsStore();
  _load = createLoadSettings(store);
  _update = createUpdateSettings(store);
  _get = createGetSettings(store);
}

export async function loadSettings(): Promise<Result<AppSettings, string>> {
  return _load.execute();
}

/** Persist settings blob (tests and migrate path). Prefer updateSettings for partials. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await saveSettingsInternal(settings);
  settingsCache = { ...settings };
  settingsLoaded = true;
}

export function getSettings(): AppSettings {
  return _get.execute();
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  return _update.execute(partial);
}
