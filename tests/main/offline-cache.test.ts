import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMockEvent, asTestMeetUrl } from "../helpers/test-utils.js";

const { appState, encryptMock, decryptMock, encryptionAvailable } = vi.hoisted(() => ({
  appState: { isPackaged: false, userData: "" },
  encryptMock: vi.fn((s: string) => Buffer.from(`enc:${s}`, "utf-8")),
  decryptMock: vi.fn((b: Buffer) => {
    const s = b.toString("utf-8");
    return s.startsWith("enc:") ? s.slice(4) : s;
  }),
  encryptionAvailable: { value: true },
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged;
    },
    getPath: (name: string) => (name === "userData" ? appState.userData : "/tmp"),
  },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable.value,
    encryptString: encryptMock,
    decryptString: decryptMock,
  },
}));

describe("offline-cache", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gogmeet-cache-"));
    appState.userData = dir;
    appState.isPackaged = false;
    encryptionAvailable.value = true;
    encryptMock.mockClear();
    decryptMock.mockClear();
    delete process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"];
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"];
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips events with encryption", async () => {
    const { saveOfflineCache, loadOfflineCache } = await import(
      "../../src/main/calendar/offline-cache.js"
    );
    const events = [
      createMockEvent({
        id: "evt-1" as never,
        meetUrl: asTestMeetUrl("https://meet.google.com/abc-defg-hij"),
        userEmail: "u@example.com",
        description: "notes",
      }),
    ];
    // recreate with proper brand via helper
    const e = createMockEvent({
      meetUrl: asTestMeetUrl("https://meet.google.com/abc-defg-hij"),
      userEmail: "u@example.com",
      description: "notes",
    });
    await saveOfflineCache([e]);
    expect(encryptMock).toHaveBeenCalled();
    const loaded = await loadOfflineCache();
    expect(loaded).not.toBeNull();
    expect(loaded!.events).toHaveLength(1);
    expect(loaded!.events[0]!.title).toBe(e.title);
    expect(loaded!.events[0]!.meetUrl).toBe(e.meetUrl);
    expect(loaded!.events[0]!.userEmail).toBe("u@example.com");
    expect(typeof loaded!.savedAt).toBe("number");
  });

  it("returns null when file missing", async () => {
    const { loadOfflineCache } = await import("../../src/main/calendar/offline-cache.js");
    expect(await loadOfflineCache()).toBeNull();
  });

  it("returns null for corrupt payload", async () => {
    const { saveOfflineCache, loadOfflineCache } = await import(
      "../../src/main/calendar/offline-cache.js"
    );
    const { writeFile, mkdir } = await import("node:fs/promises");
    const path = join(dir, "calendar-cache.enc");
    await mkdir(dir, { recursive: true });
    await writeFile(path, Buffer.from("enc:not-json", "utf-8"));
    expect(await loadOfflineCache()).toBeNull();
    await writeFile(path, Buffer.from(`enc:${JSON.stringify({ savedAt: 1 })}`, "utf-8"));
    expect(await loadOfflineCache()).toBeNull();
    await writeFile(
      path,
      Buffer.from(`enc:${JSON.stringify({ savedAt: 1, events: [{ bad: true }] })}`, "utf-8"),
    );
    const emptyish = await loadOfflineCache();
    expect(emptyish).not.toBeNull();
    expect(emptyish!.events).toEqual([]);
  });

  it("uses plaintext when encryption unavailable and dev flag set", async () => {
    encryptionAvailable.value = false;
    process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"] = "1";
    const { saveOfflineCache, loadOfflineCache } = await import(
      "../../src/main/calendar/offline-cache.js"
    );
    const e = createMockEvent();
    await saveOfflineCache([e]);
    expect(encryptMock).not.toHaveBeenCalled();
    const loaded = await loadOfflineCache();
    expect(loaded!.events).toHaveLength(1);
  });

  it("fails save quietly when encryption unavailable without plaintext flag", async () => {
    encryptionAvailable.value = false;
    appState.isPackaged = true;
    const { saveOfflineCache, loadOfflineCache } = await import(
      "../../src/main/calendar/offline-cache.js"
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await saveOfflineCache([createMockEvent()]);
    expect(warn).toHaveBeenCalled();
    expect(await loadOfflineCache()).toBeNull();
    warn.mockRestore();
  });

  it("clearOfflineCache removes file and ignores missing", async () => {
    const { saveOfflineCache, clearOfflineCache, loadOfflineCache } = await import(
      "../../src/main/calendar/offline-cache.js"
    );
    await saveOfflineCache([createMockEvent()]);
    expect(await loadOfflineCache()).not.toBeNull();
    await clearOfflineCache();
    expect(await loadOfflineCache()).toBeNull();
    await clearOfflineCache(); // no throw
  });

  it("drops invalid meetUrl but keeps event", async () => {
    encryptionAvailable.value = false;
    process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"] = "1";
    const { loadOfflineCache } = await import("../../src/main/calendar/offline-cache.js");
    const { writeFile } = await import("node:fs/promises");
    const e = createMockEvent();
    const path = join(dir, "calendar-cache.enc");
    await writeFile(
      path,
      JSON.stringify({
        savedAt: Date.now(),
        events: [
          {
            id: e.id,
            title: e.title,
            startDate: e.startDate,
            endDate: e.endDate,
            calendarName: e.calendarName,
            isAllDay: false,
            meetUrl: "http://evil.example/not-allowed",
          },
        ],
      }),
      "utf-8",
    );
    const loaded = await loadOfflineCache();
    expect(loaded!.events).toHaveLength(1);
    expect(loaded!.events[0]!.meetUrl).toBeUndefined();
  });

});
