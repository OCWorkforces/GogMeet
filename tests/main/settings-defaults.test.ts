import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  OPEN_BEFORE_MINUTES_MIN,
  OPEN_BEFORE_MINUTES_MAX,
} from "../../src/shared/settings.js";

describe("DEFAULT_SETTINGS", () => {
  it("has correct default values", () => {
    expect(DEFAULT_SETTINGS.schemaVersion).toBe(1);
    expect(DEFAULT_SETTINGS.openBeforeMinutes).toBe(1);
    expect(DEFAULT_SETTINGS.launchAtLogin).toBe(false);
    expect(DEFAULT_SETTINGS.showTomorrowMeetings).toBe(true);
    expect(DEFAULT_SETTINGS.windowAlert).toBe(true);
  });

  it("openBeforeMinutes is within valid range", () => {
    expect(DEFAULT_SETTINGS.openBeforeMinutes).toBeGreaterThanOrEqual(
      OPEN_BEFORE_MINUTES_MIN,
    );
    expect(DEFAULT_SETTINGS.openBeforeMinutes).toBeLessThanOrEqual(
      OPEN_BEFORE_MINUTES_MAX,
    );
  });
});

describe("OPEN_BEFORE_MINUTES constants", () => {
  it("defines valid range bounds", () => {
    expect(OPEN_BEFORE_MINUTES_MIN).toBe(1);
    expect(OPEN_BEFORE_MINUTES_MAX).toBe(5);
  });

  it("min is less than max", () => {
    expect(OPEN_BEFORE_MINUTES_MIN).toBeLessThan(OPEN_BEFORE_MINUTES_MAX);
  });
});
