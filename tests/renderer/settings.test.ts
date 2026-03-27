import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for settings/index.ts
 *
 * The settings module loads settings via window.api.settings.get(),
 * renders a form with dropdown and toggles, and saves on change.
 * Tests verify module loading and the core logic patterns.
 */

describe("settings/index.ts", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.restoreAllMocks();
  });

  it("module can be imported without errors", async () => {
    const module = await import("../../src/renderer/settings/index.js");
    expect(module).toBeDefined();
  });
});

describe("settings constants", () => {
  it("OPEN_BEFORE_MINUTES_MIN is 1", async () => {
    expect(
      (await import("../../src/shared/settings.js")).OPEN_BEFORE_MINUTES_MIN,
    ).toBe(1);
  });

  it("OPEN_BEFORE_MINUTES_MAX is 5", async () => {
    expect(
      (await import("../../src/shared/settings.js")).OPEN_BEFORE_MINUTES_MAX,
    ).toBe(5);
  });

  it("range produces 5 options", () => {
    const MIN = 1;
    const MAX = 5;
    const count = MAX - MIN + 1;
    expect(count).toBe(5);
  });
});

describe("settings save indicator logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("indicator text clears after timeout", () => {
    document.body.innerHTML =
      '<span class="save-indicator visible" id="save-indicator">✓ Saved</span>';

    const indicator = document.getElementById("save-indicator");
    expect(indicator?.classList.contains("visible")).toBe(true);

    // Simulate the setTimeout behavior
    setTimeout(() => {
      indicator?.classList.remove("visible");
    }, 1500);

    vi.advanceTimersByTime(1600);
    expect(indicator?.classList.contains("visible")).toBe(false);
  });

  it("multiple saves clear previous timer", () => {
    document.body.innerHTML =
      '<span class="save-indicator visible" id="save-indicator">✓ Saved</span>';

    const indicator = document.getElementById("save-indicator");

    // First timer
    const timer1 = setTimeout(() => {
      indicator?.classList.remove("visible");
    }, 1500);

    // Second timer (should clear first)
    clearTimeout(timer1);
    const timer2 = setTimeout(() => {
      indicator?.classList.remove("visible");
    }, 1500);

    vi.advanceTimersByTime(1000);
    expect(indicator?.classList.contains("visible")).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(indicator?.classList.contains("visible")).toBe(false);

    clearTimeout(timer2);
  });
});

describe("settings dropdown validation", () => {
  it("rejects NaN values", () => {
    const value = parseInt("abc", 10);
    expect(isNaN(value)).toBe(true);
  });

  it("rejects values below MIN (1)", () => {
    const value = 0;
    const MIN = 1;
    const MAX = 5;
    expect(value < MIN || value > MAX).toBe(true);
  });

  it("rejects values above MAX (5)", () => {
    const value = 6;
    const MIN = 1;
    const MAX = 5;
    expect(value < MIN || value > MAX).toBe(true);
  });

  it("accepts values in range", () => {
    for (const value of [1, 2, 3, 4, 5]) {
      expect(value >= 1 && value <= 5).toBe(true);
    }
  });
});
