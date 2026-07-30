import { describe, it, expect, vi } from "vitest";
import { mainBus } from "../../src/main/events.js";

describe("mainBus typed event helpers", () => {
  it("supports on/emit/off/once for calendar and power events", () => {
    const list = vi.fn();
    const status = vi.fn();
    const power = vi.fn();
    const onceList = vi.fn();

    mainBus.on("meeting-list-updated", list);
    mainBus.on("calendar-status-updated", status);
    mainBus.on("power-state-changed", power);
    mainBus.once("meeting-list-updated", onceList);

    mainBus.emit("meeting-list-updated", []);
    mainBus.emit("calendar-status-updated", {
      permission: "granted",
      phase: "ready",
      lastError: null,
      accountEmail: null,
      events: [],
      offline: false,
      oauthConfigured: false,
    });
    mainBus.emit("power-state-changed", { onAC: true });
    mainBus.emit("meeting-list-updated", []);

    expect(list).toHaveBeenCalledTimes(2);
    expect(onceList).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledTimes(1);
    expect(power).toHaveBeenCalledWith({ onAC: true });

    mainBus.off("meeting-list-updated", list);
    mainBus.emit("meeting-list-updated", []);
    expect(list).toHaveBeenCalledTimes(2);

    mainBus.off("calendar-status-updated", status);
    mainBus.off("power-state-changed", power);
  });

  it("emit returns false when no listeners remain", () => {
    const listener = vi.fn();
    mainBus.on("power-state-changed", listener);
    mainBus.off("power-state-changed", listener);
    expect(mainBus.emit("power-state-changed", { onAC: false })).toBe(false);
  });
});
