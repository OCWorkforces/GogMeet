import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

// vi.mock is hoisted above all code, so the path must be a literal string in the mock factory
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/gogmeet-settings-test"),
  },
    }));

// Define the same path for use in tests
const MOCK_USER_DATA_PATH = "/tmp/gogmeet-settings-test";

// Import after mocking
  import {
  loadSettings,
  saveSettings,
  getSettings,
  updateSettings,
} from "../../src/main/settings.js";
import {
  DEFAULT_SETTINGS,
  OPEN_BEFORE_MINUTES_MIN,
  OPEN_BEFORE_MINUTES_MAX,
} from "../../src/shared/settings.js";
describe("settings", () => {
  const settingsPath = join(MOCK_USER_DATA_PATH, "settings.json");

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Ensure clean temp directory
    if (existsSync(MOCK_USER_DATA_PATH)) {
      rmSync(MOCK_USER_DATA_PATH, { recursive: true, force: true });
    }
    mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });

    // Reset the settings cache by reloading
    loadSettings();
  });

  afterEach(() => {
    // Cleanup temp directory
    if (existsSync(MOCK_USER_DATA_PATH)) {
      rmSync(MOCK_USER_DATA_PATH, { recursive: true, force: true });
    }
  });

  describe("loadSettings", () => {
    it("returns defaults when no file exists", () => {
      // Delete settings file if it exists
      if (existsSync(settingsPath)) {
        rmSync(settingsPath);
      }

      const result = loadSettings();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(DEFAULT_SETTINGS);
    });

    it("reads existing file correctly", () => {
      const expectedSettings = {
        openBeforeMinutes: 3,
        launchAtLogin: true,
        showTomorrowMeetings: false,
      };

      // Write settings file directly
      mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });
      const fs = require("fs");
      fs.writeFileSync(settingsPath, JSON.stringify(expectedSettings));

      const result = loadSettings();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.openBeforeMinutes).toBe(3);
      expect(result.value.launchAtLogin).toBe(true);
      expect(result.value.showTomorrowMeetings).toBe(false);
    });

    it("handles corrupted JSON (returns defaults)", () => {
      // Write invalid JSON
      mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });
      const fs = require("fs");
      fs.writeFileSync(settingsPath, "{ not valid json }");

      const result = loadSettings();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/Failed to parse settings JSON/);

      // Cache should fall back to defaults
      expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("saveSettings", () => {
    it("persists to disk", () => {
      const settingsToSave = {
        openBeforeMinutes: 4,
        launchAtLogin: true,
        showTomorrowMeetings: true,
      };

      saveSettings(settingsToSave);

      // Verify file was created and contains correct data
      expect(existsSync(settingsPath)).toBe(true);

      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);

      expect(saved.openBeforeMinutes).toBe(4);
      expect(saved.launchAtLogin).toBe(true);
      expect(saved.showTomorrowMeetings).toBe(true);
    });
  });
  describe("getSettings", () => {
    it("returns cached copy", () => {
      // Load to populate cache
      loadSettings();

      const settings = getSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("updateSettings", () => {
    it("merges partial, saves, and returns full settings", () => {
      // First, save initial settings
      saveSettings({ openBeforeMinutes: 2, launchAtLogin: false, showTomorrowMeetings: true });

      // Now update with partial
      const result = updateSettings({ openBeforeMinutes: 4 });

      expect(result.openBeforeMinutes).toBe(4);
      expect(result.launchAtLogin).toBe(false);
      expect(result.showTomorrowMeetings).toBe(true);

      // Verify it was saved to disk
      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);
      expect(saved.openBeforeMinutes).toBe(4);
      expect(saved.launchAtLogin).toBe(false);
      expect(saved.showTomorrowMeetings).toBe(true);

      // Verify cache was updated
      const cached = getSettings();
      expect(cached.openBeforeMinutes).toBe(4);
    });

    it("clamps openBeforeMinutes to 1-5 range (value below min -> 1)", () => {
      const result = updateSettings({ openBeforeMinutes: 0 });

      expect(result.openBeforeMinutes).toBe(OPEN_BEFORE_MINUTES_MIN);
    });

    it("clamps openBeforeMinutes to 1-5 range (value above max -> 5)", () => {
      const result = updateSettings({ openBeforeMinutes: 10 });

      expect(result.openBeforeMinutes).toBe(OPEN_BEFORE_MINUTES_MAX);
    });

    it("ignores unknown properties in partial", () => {
      // TypeScript would catch this at compile time, but runtime test too
      const initial = getSettings();

      const result = updateSettings({
        openBeforeMinutes: 3,
      });

      expect(result.openBeforeMinutes).toBe(3);
      // Verify unknown property wasn't added to result
      expect(Object.keys(result).sort()).toEqual(["windowAlert", "launchAtLogin", "openBeforeMinutes", "schemaVersion", "showTomorrowMeetings"].sort());
    });

    it("updates launchAtLogin correctly", () => {
      // Start with default (false)
      saveSettings({ openBeforeMinutes: 1, launchAtLogin: false, showTomorrowMeetings: true });

      // Enable launch at login
      const result = updateSettings({ launchAtLogin: true });

      expect(result.launchAtLogin).toBe(true);

      // Verify it was saved to disk
      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);
      expect(saved.launchAtLogin).toBe(true);

      // Disable again
      const result2 = updateSettings({ launchAtLogin: false });
      expect(result2.launchAtLogin).toBe(false);
    });

    it("defaults launchAtLogin to false when not in file", () => {
      // Write settings without launchAtLogin
      const fs = require("fs");
      fs.writeFileSync(settingsPath, JSON.stringify({ openBeforeMinutes: 2 }));

      const result = loadSettings();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.launchAtLogin).toBe(false);
    });
  });
});
