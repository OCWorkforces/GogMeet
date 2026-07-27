import { describe, it, expect, vi } from "vitest";
import { mainBus } from "../../src/main/events.js";

describe("mainBus", () => {
  it("emits and receives calendar-status-updated", () => {
    const fn = vi.fn();
    mainBus.on("calendar-status-updated", fn);
    const payload = {
      permission: "granted" as const,
      phase: "ready" as const,
      lastError: null,
      accountEmail: null,
      events: [],
      offline: false,
      oauthConfigured: true,
    };
    mainBus.emit("calendar-status-updated", payload);
    expect(fn).toHaveBeenCalledWith(payload);
    mainBus.off("calendar-status-updated", fn);
  });

  it("emits meeting-list-updated", () => {
    const fn = vi.fn();
    mainBus.on("meeting-list-updated", fn);
    mainBus.emit("meeting-list-updated", []);
    expect(fn).toHaveBeenCalledWith([]);
    mainBus.off("meeting-list-updated", fn);
  });
});
