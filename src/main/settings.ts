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
    const parsed = JSON.parse(raw);

    // Validate and construct settings object
    settingsCache = {
      openBeforeMinutes: clampOpenBeforeMinutes(
        typeof parsed.openBeforeMinutes === "number"
          ? parsed.openBeforeMinutes
          : DEFAULT_SETTINGS.openBeforeMinutes,
      ),
      launchAtLogin:
        typeof parsed.launchAtLogin === "boolean"
          ? parsed.launchAtLogin
          : DEFAULT_SETTINGS.launchAtLogin,
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

  // Save and update cache
  saveSettings(merged);
  settingsCache = { ...merged };

  return getSettings();
}

// Initialize on module load
loadSettings();
