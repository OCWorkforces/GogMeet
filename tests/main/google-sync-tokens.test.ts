import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { appState, encryptMock, decryptMock, encryptionOn } = vi.hoisted(() => ({
  appState: { isPackaged: false, userData: "" },
  encryptMock: vi.fn((s: string) => Buffer.from(`enc:${s}`, "utf-8")),
  decryptMock: vi.fn((b: Buffer) => {
    const s = b.toString("utf-8");
    return s.startsWith("enc:") ? s.slice(4) : s;
  }),
  encryptionOn: { value: true },
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged;
    },
    getPath: (name: string) => (name === "userData" ? appState.userData : "/tmp"),
  },
  safeStorage: {
    isEncryptionAvailable: () => encryptionOn.value,
    encryptString: encryptMock,
    decryptString: decryptMock,
  },
}));

describe("google-sync-tokens", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gogmeet-sync-"));
    appState.userData = dir;
    appState.isPackaged = false;
    encryptionOn.value = true;
    process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"] = "1";
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"];
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips per-calendar tokens and supports clear", async () => {
    const {
      loadGoogleSyncTokens,
      saveGoogleSyncTokens,
      clearGoogleSyncToken,
      clearAllGoogleSyncTokens,
    } = await import("../../src/main/calendar/auth/google-sync-tokens.js");

    expect(await loadGoogleSyncTokens()).toEqual({});
    await saveGoogleSyncTokens({ primary: "sync-1", work: "sync-2" });
    expect(await loadGoogleSyncTokens()).toEqual({ primary: "sync-1", work: "sync-2" });
    await clearGoogleSyncToken("primary");
    expect(await loadGoogleSyncTokens()).toEqual({ work: "sync-2" });
    await clearAllGoogleSyncTokens();
    expect(await loadGoogleSyncTokens()).toEqual({});
  });
});
