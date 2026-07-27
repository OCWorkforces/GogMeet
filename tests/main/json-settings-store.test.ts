import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMockSettings } from "../helpers/test-utils.js";

const { appState } = vi.hoisted(() => ({
  appState: { userData: "" },
}));

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? appState.userData : "/tmp"),
  },
}));

describe("JsonSettingsStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gogmeet-jss-"));
    appState.userData = dir;
    vi.resetModules();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("loads defaults when missing, save and update round-trip", async () => {
    const { createJsonSettingsStore } = await import(
      "../../src/main/infrastructure/settings/json-settings-store.js"
    );
    const store = createJsonSettingsStore();
    const loaded = await store.load();
    expect(loaded.ok).toBe(true);
    const updated = await store.update({ openBeforeMinutes: 4, quietHoursEnabled: true });
    expect(updated.openBeforeMinutes).toBe(4);
    expect(store.get().openBeforeMinutes).toBe(4);
    await store.save(createMockSettings({ openBeforeMinutes: 6, showTomorrowMeetings: false }));
    const again = await store.load();
    expect(again.ok && again.value.openBeforeMinutes).toBe(6);
    expect(again.ok && again.value.showTomorrowMeetings).toBe(false);
  });

  it("handles corrupt file without throwing", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "settings.json"), "not-json", "utf-8");
    const { createJsonSettingsStore } = await import(
      "../../src/main/infrastructure/settings/json-settings-store.js"
    );
    const store = createJsonSettingsStore();
    const loaded = await store.load();
    expect(loaded).toHaveProperty("ok");
  });

  it("clamps openBeforeMinutes and migrates schema v1", async () => {
    await writeFile(
      join(dir, "settings.json"),
      JSON.stringify({
        schemaVersion: 1,
        openBeforeMinutes: 99,
        launchAtLogin: true,
        showTomorrowMeetings: true,
        windowAlert: false,
      }),
      "utf-8",
    );
    const { createJsonSettingsStore } = await import(
      "../../src/main/infrastructure/settings/json-settings-store.js"
    );
    const store = createJsonSettingsStore();
    const loaded = await store.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.openBeforeMinutes).toBeLessThanOrEqual(10);
      expect(loaded.value.schemaVersion).toBe(2);
    }
  });

  it("get throws before load and works after", async () => {
    const { createJsonSettingsStore } = await import(
      "../../src/main/infrastructure/settings/json-settings-store.js"
    );
    const store = createJsonSettingsStore();
    expect(() => store.get()).toThrow(/not loaded/);
    await store.load();
    expect(store.get().openBeforeMinutes).toBeDefined();
  });

  it("update merges partial quiet hours fields", async () => {
    const { createJsonSettingsStore } = await import(
      "../../src/main/infrastructure/settings/json-settings-store.js"
    );
    const store = createJsonSettingsStore();
    await store.load();
    const next = await store.update({
      quietHoursStart: "21:00",
      quietHoursEnd: "06:00",
      alertLeadSeconds: 30,
      lateJoinGraceMinutes: 5,
      nativeNotifications: false,
      autoOpenEnabled: false,
    });
    expect(next.quietHoursStart).toBe("21:00");
    expect(next.alertLeadSeconds).toBe(30);
    expect(next.lateJoinGraceMinutes).toBe(5);
  });
});
