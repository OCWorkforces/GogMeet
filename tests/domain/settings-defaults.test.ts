import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  OPEN_BEFORE_MINUTES_MIN,
  OPEN_BEFORE_MINUTES_MAX,
  SETTINGS_SCHEMA_VERSION,
} from "../../src/domain/entities/settings.js";

describe("DEFAULT_SETTINGS", () => {
  it("has correct default values", () => {
    expect(DEFAULT_SETTINGS.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(DEFAULT_SETTINGS.openBeforeMinutes).toBe(1);
    expect(DEFAULT_SETTINGS.launchAtLogin).toBe(false);
    expect(DEFAULT_SETTINGS.showTomorrowMeetings).toBe(true);
    expect(DEFAULT_SETTINGS.showCompletedTodayMeetings).toBe(false);
    expect(DEFAULT_SETTINGS.windowAlert).toBe(true);
    expect(DEFAULT_SETTINGS.autoOpenEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.alertLeadSeconds).toBe(60);
    expect(DEFAULT_SETTINGS.nativeNotifications).toBe(true);
    expect(DEFAULT_SETTINGS.lateJoinGraceMinutes).toBe(0);
    expect(DEFAULT_SETTINGS.quietHoursEnabled).toBe(false);
  });

  it("openBeforeMinutes is within valid range", () => {
    expect(DEFAULT_SETTINGS.openBeforeMinutes).toBeGreaterThanOrEqual(OPEN_BEFORE_MINUTES_MIN);
    expect(DEFAULT_SETTINGS.openBeforeMinutes).toBeLessThanOrEqual(OPEN_BEFORE_MINUTES_MAX);
  });
});

describe("OPEN_BEFORE_MINUTES constants", () => {
  it("defines valid range bounds", () => {
    expect(OPEN_BEFORE_MINUTES_MIN).toBe(0);
    expect(OPEN_BEFORE_MINUTES_MAX).toBe(10);
  });

  it("min is less than max", () => {
    expect(OPEN_BEFORE_MINUTES_MIN).toBeLessThan(OPEN_BEFORE_MINUTES_MAX);
  });
});
