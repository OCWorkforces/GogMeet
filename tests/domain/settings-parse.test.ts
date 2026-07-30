import { describe, it, expect } from "vitest";
import { parseSettingsRecord } from "../../src/domain/services/settings-parse.js";
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA_VERSION } from "../../src/domain/entities/settings.js";

describe("parseSettingsRecord", () => {
  it("defaults showCompletedTodayMeetings to false when missing", () => {
    const parsed = parseSettingsRecord({
      schemaVersion: 2,
      openBeforeMinutes: 1,
      launchAtLogin: false,
      showTomorrowMeetings: true,
      windowAlert: true,
    });
    expect(parsed.showCompletedTodayMeetings).toBe(false);
    expect(parsed.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
  });

  it("preserves explicit true for showCompletedTodayMeetings", () => {
    const parsed = parseSettingsRecord({
      ...DEFAULT_SETTINGS,
      showCompletedTodayMeetings: true,
    });
    expect(parsed.showCompletedTodayMeetings).toBe(true);
  });

  it("rejects non-boolean showCompletedTodayMeetings values as default false", () => {
    const parsed = parseSettingsRecord({
      showCompletedTodayMeetings: "yes",
    });
    expect(parsed.showCompletedTodayMeetings).toBe(false);
  });

  it("rejects null showCompletedTodayMeetings as default false", () => {
    const parsed = parseSettingsRecord({
      showCompletedTodayMeetings: null,
    });
    expect(parsed.showCompletedTodayMeetings).toBe(false);
  });
});
