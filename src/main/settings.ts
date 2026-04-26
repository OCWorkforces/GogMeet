import { app } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "path";
import {
  DEFAULT_SETTINGS,
  OPEN_BEFORE_MINUTES_MIN,
  OPEN_BEFORE_MINUTES_MAX,
} from "../shared/settings.js";
import type { AppSettings } from "../shared/settings.js";
import { ok, err } from "../shared/result.js";
import type { Result } from "../shared/result.js";

let settingsCache: AppSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

function getSettingsPath(): string {
  const userDataPath = app.getPath("userData");
  return join(userDataPath, "settings.json");
}

function clampOpenBeforeMinutes(value: number): number {
  return Math.max(
    OPEN_BEFORE_MINUTES_MIN,
    Math.min(OPEN_BEFORE_MINUTES_MAX, value),
  );
}

function isEnoent(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: unknown }).code === "ENOENT"
  );
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

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    // Corrupted JSON - cache defaults and surface error
    settingsCache = { ...DEFAULT_SETTINGS };
    settingsLoaded = true;
    return err(`Failed to parse settings JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Migrate legacy fullScreenAlert → windowAlert
  if (
    parsed &&
    typeof parsed.fullScreenAlert === "boolean" &&
    typeof parsed.windowAlert !== "boolean"
  ) {
    parsed.windowAlert = parsed.fullScreenAlert;
  }

  // Validate and construct settings object
  settingsCache = {
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    openBeforeMinutes: clampOpenBeforeMinutes(
      typeof parsed.openBeforeMinutes === "number"
        ? parsed.openBeforeMinutes
        : DEFAULT_SETTINGS.openBeforeMinutes,
    ),
    launchAtLogin:
      typeof parsed.launchAtLogin === "boolean"
        ? parsed.launchAtLogin
        : DEFAULT_SETTINGS.launchAtLogin,
    showTomorrowMeetings:
      typeof parsed.showTomorrowMeetings === "boolean"
        ? parsed.showTomorrowMeetings
        : DEFAULT_SETTINGS.showTomorrowMeetings,
    windowAlert:
      typeof parsed.windowAlert === "boolean"
        ? parsed.windowAlert
        : DEFAULT_SETTINGS.windowAlert,
  };
  settingsLoaded = true;
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
    throw new Error("Settings not loaded — loadSettings() must be called during app initialization");
  }
  return { ...settingsCache };
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  if (!settingsLoaded) {
    throw new Error("Settings not loaded — loadSettings() must be called during app initialization");
  }
  // Merge with current cache
  const merged: AppSettings = {
    ...settingsCache,
  };

  // Only apply known properties
  if (typeof partial.openBeforeMinutes === "number") {
    merged.openBeforeMinutes = clampOpenBeforeMinutes(
      partial.openBeforeMinutes,
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

  // Save and update cache
  await saveSettings(merged);
  settingsCache = { ...merged };

  return getSettings();
}
