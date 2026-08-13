import { describe, it, expect, vi, beforeEach } from "vitest";
import { powerMonitor, powerSaveBlocker } from "electron";
import {
  isOnBattery,
  getPollInterval,
  initPowerManagement,
  initPowerEvents,
  cleanupPowerManagement,
  preventSleep,
  allowSleep,
  isSleepPrevented,
  _resetSleepBlocker,
} from "../../src/main/system/power.js";

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
      // Re-initialize to refresh cachedOnBattery from mocked property
      initPowerManagement(vi.fn());
      expect(isOnBattery()).toBe(true);
    });
  });

  describe("getPollInterval", () => {
    it("returns 120000 (2 min) when on AC power", () => {
      Object.defineProperty(powerMonitor, "onBatteryPower", {
        value: false,
        configurable: true,
      });
      // Re-initialize to refresh cachedOnBattery from mocked property
      initPowerManagement(vi.fn());
      expect(getPollInterval()).toBe(120_000);
    });

    it("returns 240000 (4 min) when on battery power", () => {
      Object.defineProperty(powerMonitor, "onBatteryPower", {
        value: true,
        configurable: true,
      });
      // Re-initialize to refresh cachedOnBattery from mocked property
      initPowerManagement(vi.fn());
      expect(getPollInterval()).toBe(240_000);
    });
  });

  describe("initPowerManagement", () => {
    it("registers on-battery and on-ac listeners and updates cached state", () => {
      Object.defineProperty(powerMonitor, "onBatteryPower", {
        value: true,
        configurable: true,
      });
      const onChange = vi.fn();
      initPowerManagement(onChange);

      // Verify cached state was read and updated
      expect(isOnBattery()).toBe(true);
      expect(getPollInterval()).toBe(240_000);
      // Verify listeners were registered (F4: resume + unlock-screen added)
      expect(powerMonitor.on).toHaveBeenCalledWith("on-battery", expect.any(Function));
      expect(powerMonitor.on).toHaveBeenCalledWith("on-ac", expect.any(Function));
      expect(powerMonitor.on).toHaveBeenCalledWith("resume", expect.any(Function));
      expect(powerMonitor.on).toHaveBeenCalledWith("unlock-screen", expect.any(Function));
      expect(powerMonitor.on).toHaveBeenCalledTimes(4);
    });

    it("invokes onChange when resume event fires (F4: post-sleep poll)", () => {
      const onChange = vi.fn();
      initPowerManagement(onChange);
      const resumeCall = vi.mocked(powerMonitor.on).mock.calls.find((c) => c[0] === "resume");
      expect(resumeCall).toBeDefined();
      const handler = resumeCall![1] as () => void;
      handler();
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("resume");
    });

    it("invokes onChange when unlock-screen event fires (F4: post-lock poll)", () => {
      const onChange = vi.fn();
      initPowerManagement(onChange);
      const unlockCall = vi
        .mocked(powerMonitor.on)
        .mock.calls.find((c) => c[0] === "unlock-screen");
      expect(unlockCall).toBeDefined();
      const handler = unlockCall![1] as () => void;
      handler();
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("unlock");
    });

    it("on-battery and on-ac handlers flip cached state and call onChange", () => {
      const onChange = vi.fn();
      initPowerManagement(onChange);
      const onBattery = vi
        .mocked(powerMonitor.on)
        .mock.calls.find((c) => c[0] === "on-battery")?.[1] as (() => void) | undefined;
      const onAc = vi.mocked(powerMonitor.on).mock.calls.find((c) => c[0] === "on-ac")?.[1] as
        (() => void) | undefined;
      expect(onBattery).toBeTypeOf("function");
      expect(onAc).toBeTypeOf("function");
      onBattery?.();
      expect(isOnBattery()).toBe(true);
      expect(getPollInterval()).toBe(240_000);
      expect(onChange).toHaveBeenCalledWith("battery");
      onAc?.();
      expect(isOnBattery()).toBe(false);
      expect(getPollInterval()).toBe(120_000);
      expect(onChange).toHaveBeenCalledWith("ac");
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("initPowerEvents publishes power-state-changed on the main bus", async () => {
      const { mainBus } = await import("../../src/main/events.js");
      const busSpy = vi.fn();
      mainBus.on("power-state-changed", busSpy);
      vi.mocked(powerMonitor.on).mockClear();
      initPowerEvents();
      const onBattery = vi
        .mocked(powerMonitor.on)
        .mock.calls.find((c) => c[0] === "on-battery")?.[1] as (() => void) | undefined;
      const onAc = vi.mocked(powerMonitor.on).mock.calls.find((c) => c[0] === "on-ac")?.[1] as
        (() => void) | undefined;
      onBattery?.();
      onAc?.();
      expect(busSpy).toHaveBeenCalledWith({ onAC: false });
      expect(busSpy).toHaveBeenCalledWith({ onAC: true });
      mainBus.off("power-state-changed", busSpy);
    });
  });

  describe("cleanupPowerManagement", () => {
    it("removes all power listeners (F4: includes resume + unlock-screen)", () => {
      cleanupPowerManagement();

      expect(powerMonitor.removeAllListeners).toHaveBeenCalledWith("on-battery");
      expect(powerMonitor.removeAllListeners).toHaveBeenCalledWith("on-ac");
      expect(powerMonitor.removeAllListeners).toHaveBeenCalledWith("resume");
      expect(powerMonitor.removeAllListeners).toHaveBeenCalledWith("unlock-screen");
      expect(powerMonitor.removeAllListeners).toHaveBeenCalledTimes(4);
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
