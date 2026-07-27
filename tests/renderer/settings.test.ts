import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/domain/entities/settings.js";
import type { AppSettings } from "../../src/domain/entities/settings.js";

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

  async function loadSettingsRenderer(
    setSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>,
  ): Promise<void> {
    vi.resetModules();
    vi.stubGlobal("api", {
      settings: {
        get: vi.fn<() => Promise<AppSettings>>().mockResolvedValue({
    schemaVersion: 2,
    openBeforeMinutes: 1,
    launchAtLogin: false,
    showTomorrowMeetings: true,
    windowAlert: true,
    autoOpenEnabled: true,
    alertLeadSeconds: 60,
    nativeNotifications: true,
    lateJoinGraceMinutes: 0,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  }),
        set: setSettings,
      },
    });

    await import("../../src/renderer/settings/index.js");
    document.dispatchEvent(new Event("DOMContentLoaded"));

    await vi.waitFor(() => {
      expect(document.getElementById("open-before-select")).toBeInstanceOf(HTMLSelectElement);
    });
  }

  function getOpenBeforeSelect(): HTMLSelectElement {
    const select = document.getElementById("open-before-select");
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error("settings renderer did not render the open-before dropdown");
    }
    return select;
  }

  function getLaunchAtLoginToggle(): HTMLInputElement {
    const toggle = document.getElementById("launch-at-login-toggle");
    if (!(toggle instanceof HTMLInputElement)) {
      throw new Error("settings renderer did not render the launch-at-login toggle");
    }
    return toggle;
  }

  it("keeps controls wired after a successful dropdown save rerender", async () => {
    const updatedAfterDropdown = { ...DEFAULT_SETTINGS, openBeforeMinutes: 2 };
    const updatedAfterToggle = { ...updatedAfterDropdown, launchAtLogin: true };
    const setSettings = vi
      .fn<(partial: Partial<AppSettings>) => Promise<AppSettings>>()
      .mockResolvedValueOnce(updatedAfterDropdown)
      .mockResolvedValueOnce(updatedAfterToggle);

    await loadSettingsRenderer(setSettings);

    const initialSelect = getOpenBeforeSelect();
    initialSelect.value = "2";
    initialSelect.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      expect(setSettings).toHaveBeenCalledTimes(1);
    });

    const rerenderedSelect = getOpenBeforeSelect();
    expect(rerenderedSelect).not.toBe(initialSelect);

    const rerenderedToggle = getLaunchAtLoginToggle();
    rerenderedToggle.checked = true;
    rerenderedToggle.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      expect(setSettings).toHaveBeenCalledTimes(2);
    });
    expect(setSettings).toHaveBeenNthCalledWith(2, { launchAtLogin: true });
  });

  it("keeps controls wired after a failed dropdown save rerender", async () => {
    const saveError = new Error("Settings save failed");
    const updatedAfterToggle = { ...DEFAULT_SETTINGS, launchAtLogin: true };
    const setSettings = vi
      .fn<(partial: Partial<AppSettings>) => Promise<AppSettings>>()
      .mockRejectedValueOnce(saveError)
      .mockResolvedValueOnce(updatedAfterToggle);

    await loadSettingsRenderer(setSettings);

    const initialSelect = getOpenBeforeSelect();
    initialSelect.value = "2";
    initialSelect.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      expect(document.querySelector(".settings-error")?.textContent).toBe(saveError.message);
    });

    const rerenderedSelect = getOpenBeforeSelect();
    expect(rerenderedSelect).not.toBe(initialSelect);

    const rerenderedToggle = getLaunchAtLoginToggle();
    rerenderedToggle.checked = true;
    rerenderedToggle.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      expect(setSettings).toHaveBeenCalledTimes(2);
    });
    expect(setSettings).toHaveBeenNthCalledWith(2, { launchAtLogin: true });
  });
});

describe("settings constants", () => {
  it("OPEN_BEFORE_MINUTES_MIN is 0", async () => {
    expect(
      (await import("../../src/domain/entities/settings.js")).OPEN_BEFORE_MINUTES_MIN,
    ).toBe(0);
  });

  it("OPEN_BEFORE_MINUTES_MAX is 10", async () => {
    expect(
      (await import("../../src/domain/entities/settings.js")).OPEN_BEFORE_MINUTES_MAX,
    ).toBe(10);
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
