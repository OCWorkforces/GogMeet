import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isTomorrow,
  formatMeetingTime,
  formatRemainingTime,
  startOfDay,
  startOfTomorrow,
} from "../../../src/shared/utils/time.js";

describe("isTomorrow", () => {
  // Pin to a deterministic local time. 2026-06-15T12:00:00 (local) sits
  // safely away from midnight in any reasonable test-runner timezone, so the
  // tomorrow boundary won't drift across DST/UTC offsets.
  const FIXED_NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for a date during tomorrow (mid-day)", () => {
    const tomorrowMidday = new Date(2026, 5, 16, 14, 30, 0).toISOString();
    expect(isTomorrow(tomorrowMidday)).toBe(true);
  });

  it("returns true for the very first second of tomorrow (00:00:00 local)", () => {
    const tomorrowMidnight = new Date(2026, 5, 16, 0, 0, 0).toISOString();
    expect(isTomorrow(tomorrowMidnight)).toBe(true);
  });

  it("returns false for the last second of today (23:59:59 local)", () => {
    const todayLastSecond = new Date(2026, 5, 15, 23, 59, 59).toISOString();
    expect(isTomorrow(todayLastSecond)).toBe(false);
  });

  it("returns false for the first second of the day after tomorrow", () => {
    const dayAfterMidnight = new Date(2026, 5, 17, 0, 0, 0).toISOString();
    expect(isTomorrow(dayAfterMidnight)).toBe(false);
  });

  it("returns false for today (a few hours from now)", () => {
    const laterToday = new Date(2026, 5, 15, 18, 0, 0).toISOString();
    expect(isTomorrow(laterToday)).toBe(false);
  });

  it("returns false for yesterday", () => {
    const yesterday = new Date(2026, 5, 14, 12, 0, 0).toISOString();
    expect(isTomorrow(yesterday)).toBe(false);
  });

  it("returns false for a date several days out", () => {
    const nextWeek = new Date(2026, 5, 22, 12, 0, 0).toISOString();
    expect(isTomorrow(nextWeek)).toBe(false);
  });
});

describe("formatMeetingTime", () => {
  it("returns a string containing hour and minute fields", () => {
    const iso = new Date(2026, 5, 15, 10, 5, 0).toISOString();
    const out = formatMeetingTime(iso);
    // Locale-dependent (en-US "10:05 AM" vs en-GB "10:05"), but must contain
    // the minute zero-padded and the hour digit.
    expect(out).toMatch(/10[^\d]?05/);
  });

  it("zero-pads single-digit minutes (uses 2-digit minute)", () => {
    const iso = new Date(2026, 5, 15, 9, 5, 0).toISOString();
    const out = formatMeetingTime(iso);
    // Must show "05" (zero-padded), not bare ":5" without leading zero.
    expect(out).toContain("05");
    expect(out).not.toMatch(/:5(?!\d)/);
  });

  it("does not zero-pad single-digit hours (uses numeric hour)", () => {
    const iso = new Date(2026, 5, 15, 9, 30, 0).toISOString();
    const out = formatMeetingTime(iso);
    // 9 should appear as "9", not "09".
    expect(out).toMatch(/(^|\D)9\D/);
  });

  it("returns a non-empty string for any valid date", () => {
    const iso = new Date(2026, 5, 15, 14, 0, 0).toISOString();
    const out = formatMeetingTime(iso);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("formatRemainingTime", () => {
  it("returns '0m' for zero minutes", () => {
    expect(formatRemainingTime(0)).toBe("0m");
  });

  it("returns '0m' for negative minutes (clamps to zero)", () => {
    expect(formatRemainingTime(-5)).toBe("0m");
    expect(formatRemainingTime(-1)).toBe("0m");
  });

  it("returns 'Xm' for sub-hour values", () => {
    expect(formatRemainingTime(1)).toBe("1m");
    expect(formatRemainingTime(15)).toBe("15m");
    expect(formatRemainingTime(59)).toBe("59m");
  });

  it("returns 'Xh' for whole-hour values", () => {
    expect(formatRemainingTime(60)).toBe("1h");
    expect(formatRemainingTime(120)).toBe("2h");
    expect(formatRemainingTime(180)).toBe("3h");
  });

  it("returns 'Xh Ym' for hour+minute values", () => {
    expect(formatRemainingTime(61)).toBe("1h 1m");
    expect(formatRemainingTime(75)).toBe("1h 15m");
    expect(formatRemainingTime(135)).toBe("2h 15m");
  });

  it("handles large values correctly", () => {
    expect(formatRemainingTime(1440)).toBe("24h");
    expect(formatRemainingTime(1441)).toBe("24h 1m");
  });
});

describe("startOfDay", () => {
  it("returns midnight of the same calendar day", () => {
    const input = new Date(2026, 5, 15, 14, 35, 27);
    const out = startOfDay(input);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(5);
    expect(out.getDate()).toBe(15);
    expect(out.getHours()).toBe(0);
    expect(out.getMinutes()).toBe(0);
    expect(out.getSeconds()).toBe(0);
    expect(out.getMilliseconds()).toBe(0);
  });

  it("does not mutate the input Date", () => {
    const input = new Date(2026, 5, 15, 14, 35, 27);
    const originalTime = input.getTime();
    startOfDay(input);
    expect(input.getTime()).toBe(originalTime);
  });

  it("returns midnight when input is already midnight", () => {
    const input = new Date(2026, 5, 15, 0, 0, 0);
    const out = startOfDay(input);
    expect(out.getTime()).toBe(input.getTime());
  });
});

describe("startOfTomorrow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 14, 35, 27).getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns midnight of the day after today", () => {
    const out = startOfTomorrow();
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(5);
    expect(out.getDate()).toBe(16);
    expect(out.getHours()).toBe(0);
    expect(out.getMinutes()).toBe(0);
    expect(out.getSeconds()).toBe(0);
    expect(out.getMilliseconds()).toBe(0);
  });

  it("rolls over month boundary", () => {
    vi.setSystemTime(new Date(2026, 5, 30, 23, 59, 0).getTime());
    const out = startOfTomorrow();
    expect(out.getMonth()).toBe(6); // July
    expect(out.getDate()).toBe(1);
  });

  it("rolls over year boundary", () => {
    vi.setSystemTime(new Date(2026, 11, 31, 23, 0, 0).getTime());
    const out = startOfTomorrow();
    expect(out.getFullYear()).toBe(2027);
    expect(out.getMonth()).toBe(0); // January
    expect(out.getDate()).toBe(1);
  });
});
