import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMockSettings } from "../helpers/test-utils.js";

const { appState } = vi.hoisted(() => ({
  appState: { userData: "" },
}));

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? appState.userData : "/tmp"),
    isPackaged: false,
  },
}));

describe("settings facade", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gogmeet-settings-facade-"));
    appState.userData = dir;
    vi.resetModules();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("load/get/update/save and rebindDefaults", async () => {
    const settings = await import("../../src/main/facades/settings.js");
    settings.rebindSettingsDefaults();
    const loaded = await settings.loadSettings();
    expect(loaded.ok).toBe(true);
    const current = settings.getSettings();
    expect(current.openBeforeMinutes).toBeDefined();

    const updated = await settings.updateSettings({ openBeforeMinutes: 3 });
    expect(updated.openBeforeMinutes).toBe(3);
    expect(settings.getSettings().openBeforeMinutes).toBe(3);

    const custom = createMockSettings({ openBeforeMinutes: 7, showTomorrowMeetings: false });
    await settings.saveSettings(custom);
    // get may still be memory until load — rebind + load
    settings.rebindSettingsDefaults();
    const again = await settings.loadSettings();
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.openBeforeMinutes).toBe(7);
    }
  });

  it("bindSettingsUseCases with store override", async () => {
    const settings = await import("../../src/main/facades/settings.js");
    const store = {
      load: vi.fn().mockResolvedValue({ ok: true, value: createMockSettings({ openBeforeMinutes: 2 }) }),
      get: vi.fn().mockReturnValue(createMockSettings({ openBeforeMinutes: 2 })),
      update: vi.fn().mockImplementation(async (p: { openBeforeMinutes?: number }) =>
        createMockSettings({ openBeforeMinutes: p.openBeforeMinutes ?? 2 }),
      ),
      save: vi.fn().mockResolvedValue(undefined),
    };
    settings.bindSettingsUseCases({ store });
    expect(settings.getSettings().openBeforeMinutes).toBe(2);
    await settings.updateSettings({ openBeforeMinutes: 5 });
    expect(store.update).toHaveBeenCalled();
    settings.rebindSettingsDefaults();
  });

  it("bindSettingsUseCases with individual use cases", async () => {
    const settings = await import("../../src/main/facades/settings.js");
    const load = { execute: vi.fn().mockResolvedValue({ ok: true, value: createMockSettings() }) };
    const update = { execute: vi.fn().mockResolvedValue(createMockSettings({ openBeforeMinutes: 1 })) };
    const get = { execute: vi.fn().mockReturnValue(createMockSettings({ openBeforeMinutes: 1 })) };
    settings.bindSettingsUseCases({ load, update, get });
    await settings.loadSettings();
    expect(load.execute).toHaveBeenCalled();
    expect(settings.getSettings().openBeforeMinutes).toBe(1);
    await settings.updateSettings({ openBeforeMinutes: 1 });
    expect(update.execute).toHaveBeenCalled();
    settings.rebindSettingsDefaults();
  });
});
