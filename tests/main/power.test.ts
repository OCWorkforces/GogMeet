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
