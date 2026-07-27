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
    getPath: (name: string) => {
      if (name === "userData") return appState.userData;
      return "/tmp";
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => encryptionOn.value,
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
    encryptionOn.value = true;
    encryptMock.mockClear();
    decryptMock.mockClear();
    encryptMock.mockImplementation((s: string) => Buffer.from(`enc:${s}`, "utf-8"));
    decryptMock.mockImplementation((b: Buffer) => {
      const s = b.toString("utf-8");
      return s.startsWith("enc:") ? s.slice(4) : s;
    });
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
      scope: "openid",
    });
    const loaded = await loadGoogleTokens();
    expect(loaded).not.toBeNull();
    expect(loaded?.accessToken).toBe("access");
    expect(loaded?.refreshToken).toBe("refresh");
    expect(loaded?.clientId).toBe("test-client-id.apps.googleusercontent.com");
    expect(loaded?.authSchemaVersion).toBe(1);
    expect(loaded?.email).toBe("user@example.com");
    expect(loaded?.scope).toBe("openid");
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
    expect(await loadGoogleTokens()).toBeNull();
  });

  it("clearGoogleTokens removes file", async () => {
    const store = await import("../../src/main/calendar/auth/google-token-store.js");
    await store.saveGoogleTokens({
      accessToken: "a",
      refreshToken: "r",
      expiryMs: Date.now() + 1000,
    });
    await store.clearGoogleTokens();
    expect(await store.loadGoogleTokens()).toBeNull();
    await store.clearGoogleTokens(); // missing file ok
  });

  it("load returns null for corrupt JSON", async () => {
    const store = await import("../../src/main/calendar/auth/google-token-store.js");
    await store.saveGoogleTokens({
      accessToken: "a",
      refreshToken: "r",
      expiryMs: Date.now() + 99999,
    });
    decryptMock.mockReturnValueOnce("not-json");
    expect(await store.loadGoogleTokens()).toBeNull();
  });

  it("save throws when client id missing", async () => {
    delete process.env["GOOGLE_OAUTH_CLIENT_ID"];
    vi.resetModules();
    const store = await import("../../src/main/calendar/auth/google-token-store.js");
    await expect(
      store.saveGoogleTokens({
        accessToken: "a",
        refreshToken: "r",
        expiryMs: Date.now() + 1000,
      }),
    ).rejects.toThrow(/GOOGLE_OAUTH_CLIENT_ID/);
  });

  it("uses plaintext when encryption off and dev flag set", async () => {
    encryptionOn.value = false;
    process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"] = "1";
    vi.resetModules();
    const store = await import("../../src/main/calendar/auth/google-token-store.js");
    await store.saveGoogleTokens({
      accessToken: "plain",
      refreshToken: "r",
      expiryMs: Date.now() + 1000,
    });
    expect(encryptMock).not.toHaveBeenCalled();
    const loaded = await store.loadGoogleTokens();
    expect(loaded?.accessToken).toBe("plain");
  });

  it("save fails closed when packaged without encryption", async () => {
    encryptionOn.value = false;
    appState.isPackaged = true;
    delete process.env["GOGMEET_ALLOW_PLAINTEXT_TOKENS"];
    vi.resetModules();
    const store = await import("../../src/main/calendar/auth/google-token-store.js");
    await expect(
      store.saveGoogleTokens({
        accessToken: "a",
        refreshToken: "r",
        expiryMs: Date.now() + 1000,
      }),
    ).rejects.toThrow(/secure storage/);
  });
});
