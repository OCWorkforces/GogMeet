import { describe, it, expect, vi, beforeEach } from "vitest";
import { powerMonitor, powerSaveBlocker } from "electron";
import {
  isOnBattery,
  getPollInterval,
  initPowerManagement,
  cleanupPowerManagement,
  preventSleep,
  allowSleep,
  isSleepPrevented,
  _resetSleepBlocker,
} from "../../src/main/power.js";

describe("power", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isOnBattery", () => {
    it("returns false when on AC power", () => {
      Object.defineProperty(powerMonitor, "onBatteryPower", {
        value: false,
        configurable: true,
      });
      expect(isOnBattery()).toBe(false);
    });

    it("returns true when on battery power", () => {
      Object.defineProperty(powerMonitor, "onBatteryPower", {
        value: true,
        configurable: true,
      });
      expect(isOnBattery()).toBe(true);
    });
  });

  describe("getPollInterval", () => {
    it("returns 120000 (2 min) when on AC power", () => {
      Object.defineProperty(powerMonitor, "onBatteryPower", {
        value: false,
        configurable: true,
      });
      expect(getPollInterval()).toBe(120_000);
    });

    it("returns 240000 (4 min) when on battery power", () => {
      Object.defineProperty(powerMonitor, "onBatteryPower", {
        value: true,
        configurable: true,
      });
      expect(getPollInterval()).toBe(240_000);
    });
  });

  describe("initPowerManagement", () => {
    it("registers on-battery and on-ac listeners", () => {
      const onChange = vi.fn();
      initPowerManagement(onChange);

      expect(powerMonitor.on).toHaveBeenCalledWith("on-battery", onChange);
      expect(powerMonitor.on).toHaveBeenCalledWith("on-ac", onChange);
      expect(powerMonitor.on).toHaveBeenCalledTimes(2);
    });
  });

  describe("cleanupPowerManagement", () => {
    it("removes all on-battery and on-ac listeners", () => {
      cleanupPowerManagement();

      expect(powerMonitor.removeAllListeners).toHaveBeenCalledWith(
        "on-battery",
      );
      expect(powerMonitor.removeAllListeners).toHaveBeenCalledWith("on-ac");
      expect(powerMonitor.removeAllListeners).toHaveBeenCalledTimes(2);
    });
  });

  describe("preventSleep / allowSleep / isSleepPrevented", () => {
    beforeEach(() => {
      _resetSleepBlocker();
      vi.mocked(powerSaveBlocker.start).mockClear();
      vi.mocked(powerSaveBlocker.stop).mockClear();
    });

    it("starts blocker on first preventSleep call", () => {
      preventSleep();
      expect(powerSaveBlocker.start).toHaveBeenCalledWith("prevent-display-sleep");
      expect(powerSaveBlocker.start).toHaveBeenCalledTimes(1);
      expect(isSleepPrevented()).toBe(true);
    });

    it("does not re-start blocker on subsequent preventSleep calls", () => {
      preventSleep();
      preventSleep();
      preventSleep();
      expect(powerSaveBlocker.start).toHaveBeenCalledTimes(1);
      expect(isSleepPrevented()).toBe(true);
    });

    it("stops blocker only when refCount reaches 0", () => {
      preventSleep();
      preventSleep();
      allowSleep();
      expect(powerSaveBlocker.stop).not.toHaveBeenCalled();
      expect(isSleepPrevented()).toBe(true);
      allowSleep();
      expect(powerSaveBlocker.stop).toHaveBeenCalledTimes(1);
      expect(isSleepPrevented()).toBe(false);
    });

    it("does nothing when allowSleep is called with zero refCount", () => {
      allowSleep();
      expect(powerSaveBlocker.stop).not.toHaveBeenCalled();
      expect(isSleepPrevented()).toBe(false);
    });

    it("isSleepPrevented returns false initially", () => {
      expect(isSleepPrevented()).toBe(false);
    });

    it("reference counting: 3 prevents, 3 allows — blocker started and stopped once", () => {
      preventSleep();
      preventSleep();
      preventSleep();
      expect(powerSaveBlocker.start).toHaveBeenCalledTimes(1);
      expect(isSleepPrevented()).toBe(true);

      allowSleep();
      allowSleep();
      expect(powerSaveBlocker.stop).not.toHaveBeenCalled();
      expect(isSleepPrevented()).toBe(true);

      allowSleep();
      expect(powerSaveBlocker.stop).toHaveBeenCalledTimes(1);
      expect(isSleepPrevented()).toBe(false);
    });

    it("can start a new blocker after fully releasing", () => {
      preventSleep();
      allowSleep();
      expect(isSleepPrevented()).toBe(false);

      preventSleep();
      expect(powerSaveBlocker.start).toHaveBeenCalledTimes(2);
      expect(isSleepPrevented()).toBe(true);
    });
  });
});

describe("power — extended powerSaveBlocker lifecycle", () => {
  beforeEach(() => {
    _resetSleepBlocker();
    vi.mocked(powerSaveBlocker.start).mockReset();
    vi.mocked(powerSaveBlocker.start).mockReturnValue(1);
    vi.mocked(powerSaveBlocker.stop).mockReset();
  });

  it("powerSaveBlocker.start receives 'prevent-display-sleep' arg exactly", () => {
    preventSleep();
    expect(powerSaveBlocker.start).toHaveBeenCalledWith("prevent-display-sleep");
  });

  it("ref count 0 → 1: start invoked once on first preventSleep", () => {
    expect(isSleepPrevented()).toBe(false);
    preventSleep();
    expect(powerSaveBlocker.start).toHaveBeenCalledTimes(1);
    expect(isSleepPrevented()).toBe(true);
  });

  it("ref count 1 → 2: start NOT invoked again on second preventSleep", () => {
    preventSleep();
    vi.mocked(powerSaveBlocker.start).mockClear();
    preventSleep();
    expect(powerSaveBlocker.start).not.toHaveBeenCalled();
    expect(isSleepPrevented()).toBe(true);
  });

  it("allowSleep does NOT call stop until ref count hits 0 (3→2→1→0)", () => {
    preventSleep();
    preventSleep();
    preventSleep();
    allowSleep();
    expect(powerSaveBlocker.stop).not.toHaveBeenCalled();
    allowSleep();
    expect(powerSaveBlocker.stop).not.toHaveBeenCalled();
    allowSleep();
    expect(powerSaveBlocker.stop).toHaveBeenCalledTimes(1);
  });

  it("allowSleep passes the original blocker id returned by start", () => {
    vi.mocked(powerSaveBlocker.start).mockReturnValue(42);
    preventSleep();
    allowSleep();
    expect(powerSaveBlocker.stop).toHaveBeenCalledWith(42);
  });

  it("allowSleep with no prior preventSleep is a graceful no-op", () => {
    expect(() => allowSleep()).not.toThrow();
    expect(powerSaveBlocker.stop).not.toHaveBeenCalled();
    expect(isSleepPrevented()).toBe(false);
  });

  it("multiple unmatched allowSleep calls remain no-ops", () => {
    allowSleep();
    allowSleep();
    allowSleep();
    expect(powerSaveBlocker.stop).not.toHaveBeenCalled();
    expect(isSleepPrevented()).toBe(false);
  });

  it("preventSleep recovers gracefully when powerSaveBlocker.start throws", () => {
    vi.mocked(powerSaveBlocker.start).mockImplementationOnce(() => {
      throw new Error("blocker init failed");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => preventSleep()).not.toThrow();
    expect(isSleepPrevented()).toBe(false);
    // Subsequent preventSleep can still establish a blocker (refCount rolled back)
    preventSleep();
    expect(isSleepPrevented()).toBe(true);

    errSpy.mockRestore();
  });

  it("allowSleep recovers gracefully when powerSaveBlocker.stop throws", () => {
    vi.mocked(powerSaveBlocker.stop).mockImplementationOnce(() => {
      throw new Error("blocker stop failed");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    preventSleep();
    expect(() => allowSleep()).not.toThrow();
    // After failed stop, blockerId is cleared so isSleepPrevented reports false
    expect(isSleepPrevented()).toBe(false);

    errSpy.mockRestore();
  });
});
