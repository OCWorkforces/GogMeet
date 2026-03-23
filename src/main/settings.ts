import { app } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  DEFAULT_SETTINGS,
  OPEN_BEFORE_MINUTES_MIN,
  OPEN_BEFORE_MINUTES_MAX,
} from "../shared/types.js";
import type { AppSettings } from "../shared/types.js";

let settingsCache: AppSettings = { ...DEFAULT_SETTINGS };

function getSettingsPath(): string {
  const userDataPath = app.getPath("userData");
  return join(userDataPath, "settings.json");
}

function ensureUserDataDir(): void {
  const userDataPath = app.getPath("userData");
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }
}

function clampOpenBeforeMinutes(value: number): number {
  return Math.max(
    OPEN_BEFORE_MINUTES_MIN,
    Math.min(OPEN_BEFORE_MINUTES_MAX, value),
  );
}

export function loadSettings(): AppSettings {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    settingsCache = { ...DEFAULT_SETTINGS };
    return settingsCache;
  }

  try {
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Migrate legacy fullScreenAlert → windowAlert
    if (
      parsed &&
      typeof parsed.fullScreenAlert === "boolean" &&
      typeof (parsed as Record<string, unknown>).windowAlert !== "boolean"
    ) {
      (parsed as Record<string, unknown>).windowAlert = parsed.fullScreenAlert;
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
        typeof (parsed as Record<string, unknown>).windowAlert === "boolean"
          ? ((parsed as Record<string, unknown>).windowAlert as boolean)
          : DEFAULT_SETTINGS.windowAlert,
    };
    return settingsCache;
  } catch {
    // Corrupted JSON or other error - return defaults
    settingsCache = { ...DEFAULT_SETTINGS };
    return settingsCache;
  }
}

export function saveSettings(settings: AppSettings): void {
  ensureUserDataDir();
  const settingsPath = getSettingsPath();
  const raw = JSON.stringify(settings, null, 2);
  writeFileSync(settingsPath, raw, "utf-8");
}

export function getSettings(): AppSettings {
  return { ...settingsCache };
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
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
  saveSettings(merged);
  settingsCache = { ...merged };

  return getSettings();
}

// Initialize on module load
loadSettings();
