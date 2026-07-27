import { describe, it, expect } from "vitest";
import { isInQuietHours } from "../../src/domain/entities/settings.js";

describe("isInQuietHours", () => {
  it("handles same-day window", () => {
    // 09:00–17:00
    const noon = new Date(2026, 0, 1, 12, 0, 0);
    const evening = new Date(2026, 0, 1, 20, 0, 0);
    expect(isInQuietHours(noon, "09:00", "17:00")).toBe(true);
    expect(isInQuietHours(evening, "09:00", "17:00")).toBe(false);
  });

  it("handles midnight wrap (22:00–07:00)", () => {
    const night = new Date(2026, 0, 1, 23, 30, 0);
    const morning = new Date(2026, 0, 1, 6, 0, 0);
    const afternoon = new Date(2026, 0, 1, 15, 0, 0);
    expect(isInQuietHours(night, "22:00", "07:00")).toBe(true);
    expect(isInQuietHours(morning, "22:00", "07:00")).toBe(true);
    expect(isInQuietHours(afternoon, "22:00", "07:00")).toBe(false);
  });

  it("returns false for equal start/end (disabled window)", () => {
    const noon = new Date(2026, 0, 1, 12, 0, 0);
    expect(isInQuietHours(noon, "10:00", "10:00")).toBe(false);
  });
});
