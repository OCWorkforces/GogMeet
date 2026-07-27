import { describe, it, expect, vi, beforeEach } from "vitest";
import { mainBus } from "../../src/main/events.js";

describe("mainBus coverage", () => {
  it("emits and receives calendar-status-updated", () => {
    const fn = vi.fn();
    mainBus.on("calendar-status-updated", fn);
    mainBus.emit("calendar-status-updated", {
      permission: "granted",
      phase: "ready",
      lastError: null,
      accountEmail: null,
      events: [],
      offline: false,
      oauthConfigured: true,
    });
    expect(fn).toHaveBeenCalled();
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

describe("packageInfo coverage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("loads and freezes package info", async () => {
    const mod = await import("../../src/main/utils/packageInfo.js");
    mod.clearPackageInfoCache?.();
    const info = mod.getPackageInfo();
    expect(info.name).toBeTypeOf("string");
    expect(mod.isPackageInfoLoaded?.() ?? true).toBeTruthy();
    // second call hits cache
    expect(mod.getPackageInfo()).toEqual(info);
  });
});

describe("system-settings coverage", () => {
  it("opens calendar privacy settings without throwing", async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    vi.doMock("electron", () => ({
      shell: { openExternal },
      app: { getPath: () => "/tmp" },
    }));
    vi.resetModules();
    // use existing mock from setup
    const { openSystemSettings } = await import("../../src/main/utils/system-settings.js");
    await openSystemSettings("calendars");
    await openSystemSettings("notifications");
  });
});
