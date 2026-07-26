import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { appState, encryptMock, decryptMock } = vi.hoisted(() => ({
  appState: { isPackaged: false, userData: "" },
  encryptMock: vi.fn((s: string) => Buffer.from(`enc:${s}`, "utf-8")),
  decryptMock: vi.fn((b: Buffer) => {
    const s = b.toString("utf-8");
    return s.startsWith("enc:") ? s.slice(4) : s;
  }),
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged;
    },
    getPath: (name: string) => {
      if (name === "userData") return appState.userData;
      return "/tmp";
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: encryptMock,
    decryptString: decryptMock,
  },
}));

describe("google-token-store", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gogmeet-tokens-"));
    appState.userData = dir;
    appState.isPackaged = false;
    process.env["GOOGLE_OAUTH_CLIENT_ID"] = "test-client-id.apps.googleusercontent.com";
    process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"] = "1";
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env["GOOGLE_OAUTH_CLIENT_ID"];
    delete process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"];
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips tokens with matching clientId", async () => {
    const { saveGoogleTokens, loadGoogleTokens } = await import(
      "../../src/main/calendar/auth/google-token-store.js"
    );

    await saveGoogleTokens({
      accessToken: "access",
      refreshToken: "refresh",
      expiryMs: Date.now() + 3600_000,
      email: "user@example.com",
    });

    const loaded = await loadGoogleTokens();
    expect(loaded).not.toBeNull();
    expect(loaded?.accessToken).toBe("access");
    expect(loaded?.refreshToken).toBe("refresh");
    expect(loaded?.email).toBe("user@example.com");
    expect(loaded?.clientId).toBe("test-client-id.apps.googleusercontent.com");
    expect(loaded?.authSchemaVersion).toBe(1);
  });

  it("wipes tokens when clientId mismatches", async () => {
    const store = await import("../../src/main/calendar/auth/google-token-store.js");
    await store.saveGoogleTokens({
      accessToken: "access",
      refreshToken: "refresh",
      expiryMs: Date.now() + 3600_000,
      clientId: "test-client-id.apps.googleusercontent.com",
    });

    process.env["GOOGLE_OAUTH_CLIENT_ID"] = "other-client.apps.googleusercontent.com";
    vi.resetModules();
    const { loadGoogleTokens } = await import(
      "../../src/main/calendar/auth/google-token-store.js"
    );
    const loaded = await loadGoogleTokens();
    expect(loaded).toBeNull();
  });
});
