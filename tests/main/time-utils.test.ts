import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isTomorrow,
  formatMeetingTime,
  formatRemainingTime,
} from "../../src/shared/utils/time.js";

describe("isTomorrow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for tomorrow at noon", () => {
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0)); // Jun 15
    expect(isTomorrow("2025-06-16T12:00:00")).toBe(true);
  });

  it("returns true for tomorrow at midnight (00:00:00)", () => {
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0));
    expect(isTomorrow("2025-06-16T00:00:00")).toBe(true);
  });

  it("returns true for tomorrow at 23:59:59", () => {
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0));
    expect(isTomorrow("2025-06-16T23:59:59")).toBe(true);
  });

  it("returns false for today", () => {
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0));
    expect(isTomorrow("2025-06-15T14:00:00")).toBe(false);
  });

  it("returns false for the day after tomorrow", () => {
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0));
    expect(isTomorrow("2025-06-17T12:00:00")).toBe(false);
  });

  it("returns false for yesterday", () => {
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0));
    expect(isTomorrow("2025-06-14T12:00:00")).toBe(false);
  });

  it("returns false for a date a week in the past", () => {
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0));
    expect(isTomorrow("2025-06-08T12:00:00")).toBe(false);
  });

  it("returns false for a date a week in the future", () => {
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0));
    expect(isTomorrow("2025-06-22T12:00:00")).toBe(false);
  });
});

describe("formatMeetingTime", () => {
  // Force a consistent locale for deterministic output
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats a morning time", () => {
    const result = formatMeetingTime("2025-06-15T09:30:00");
    // toLocaleTimeString with hour: "numeric", minute: "2-digit"
    expect(result).toMatch(/9:30/);
  });

  it("formats an afternoon time", () => {
    const result = formatMeetingTime("2025-06-15T14:00:00");
    expect(result).toMatch(/2:00/);
  });

  it("formats midnight", () => {
    const result = formatMeetingTime("2025-06-15T00:00:00");
    expect(result).toMatch(/12:00/);
  });

  it("formats noon", () => {
    const result = formatMeetingTime("2025-06-15T12:00:00");
    expect(result).toMatch(/12:00/);
  });

  it("formats with leading zero minutes", () => {
    const result = formatMeetingTime("2025-06-15T08:05:00");
    expect(result).toMatch(/8:05/);
  });
});

describe("formatRemainingTime", () => {
  it('returns "0m" for 0 minutes', () => {
    expect(formatRemainingTime(0)).toBe("0m");
  });

  it('returns "0m" for negative minutes', () => {
    expect(formatRemainingTime(-5)).toBe("0m");
  });

  it('returns "5m" for 5 minutes', () => {
    expect(formatRemainingTime(5)).toBe("5m");
  });

  it('returns "45m" for 45 minutes', () => {
    expect(formatRemainingTime(45)).toBe("45m");
  });

  it('returns "1h" for exactly 60 minutes', () => {
    expect(formatRemainingTime(60)).toBe("1h");
  });

  it('returns "1h 30m" for 90 minutes', () => {
    expect(formatRemainingTime(90)).toBe("1h 30m");
  });

  it('returns "2h 15m" for 135 minutes', () => {
    expect(formatRemainingTime(135)).toBe("2h 15m");
  });

  it('returns "24h" for 1440 minutes', () => {
    expect(formatRemainingTime(1440)).toBe("24h");
  });
});
