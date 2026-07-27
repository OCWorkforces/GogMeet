import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  loadGoogleTokens,
  saveGoogleTokens,
  clearGoogleTokens,
  getGoogleOAuthClientId,
  isGoogleOAuthConfigured,
  openExternal,
} = vi.hoisted(() => ({
  loadGoogleTokens: vi.fn(),
  saveGoogleTokens: vi.fn(),
  clearGoogleTokens: vi.fn(),
  getGoogleOAuthClientId: vi.fn(),
  isGoogleOAuthConfigured: vi.fn(),
  openExternal: vi.fn(),
}));

vi.mock("../../src/main/calendar/auth/google-token-store.js", () => ({
  loadGoogleTokens,
  saveGoogleTokens,
  clearGoogleTokens,
}));
vi.mock("../../src/main/calendar/auth/google-client-id.js", () => ({
  getGoogleOAuthClientId,
  isGoogleOAuthConfigured,
}));
vi.mock("electron", () => ({
  shell: { openExternal },
}));

const baseTokens = {
  authSchemaVersion: 1 as const,
  clientId: "client",
  accessToken: "old-access",
  refreshToken: "refresh",
  expiryMs: Date.now() + 3_600_000,
  email: "a@b.com",
};

describe("google-oauth", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    loadGoogleTokens.mockReset();
    saveGoogleTokens.mockReset().mockResolvedValue(undefined);
    clearGoogleTokens.mockReset().mockResolvedValue(undefined);
    getGoogleOAuthClientId.mockReset().mockReturnValue("client.apps.googleusercontent.com");
    isGoogleOAuthConfigured.mockReset().mockReturnValue(true);
    openExternal.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when no tokens", async () => {
    loadGoogleTokens.mockResolvedValue(null);
    const { ensureFreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    expect(await ensureFreshGoogleAccessToken()).toBeNull();
  });

  it("returns tokens when still fresh", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 120_000 });
    const { ensureFreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const t = await ensureFreshGoogleAccessToken();
    expect(t?.accessToken).toBe("old-access");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes when near expiry", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 10_000 });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { ensureFreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const t = await ensureFreshGoogleAccessToken();
    expect(t?.accessToken).toBe("new-access");
    expect(saveGoogleTokens).toHaveBeenCalled();
  });

  it("clears tokens on refresh failure", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error_description: "invalid_grant" }), { status: 400 }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ensureFreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    expect(await ensureFreshGoogleAccessToken()).toBeNull();
    expect(clearGoogleTokens).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("isGoogleOAuthInFlight is false initially", async () => {
    const { isGoogleOAuthInFlight } = await import("../../src/main/calendar/auth/google-oauth.js");
    expect(isGoogleOAuthInFlight()).toBe(false);
  });

  it("runGooglePkceLogin returns denied when not configured", async () => {
    isGoogleOAuthConfigured.mockReturnValue(false);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runGooglePkceLogin } = await import("../../src/main/calendar/auth/google-oauth.js");
    expect(await runGooglePkceLogin()).toBe("denied");
    err.mockRestore();
  });

  it("completes PKCE flow with successful callback", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : String((input as Request).url);
      if (url.includes("googleapis.com/token") || url.endsWith("/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access",
            refresh_token: "refresh",
            expires_in: 3600,
            scope: "openid email",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("userinfo")) {
        return new Response(JSON.stringify({ email: "user@example.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    });

    const http = await import("node:http");
    openExternal.mockImplementation(async (authUrl: string) => {
      const u = new URL(authUrl);
      const redirect = u.searchParams.get("redirect_uri");
      const state = u.searchParams.get("state");
      if (!redirect || !state) throw new Error("missing redirect/state");
      await new Promise<void>((resolve, reject) => {
        http
          .get(`${redirect}?code=auth-code&state=${state}`, (res) => {
            res.resume();
            res.on("end", () => resolve());
          })
          .on("error", reject);
      });
    });

    const { runGooglePkceLogin } = await import("../../src/main/calendar/auth/google-oauth.js");
    const result = await runGooglePkceLogin();
    expect(result).toBe("granted");
    expect(saveGoogleTokens).toHaveBeenCalled();
    const saved = saveGoogleTokens.mock.calls[0]?.[0] as { accessToken: string; email?: string };
    expect(saved.accessToken).toBe("access");
    expect(saved.email).toBe("user@example.com");
  });

  it("returns denied on OAuth error param", async () => {
    const http = await import("node:http");
    openExternal.mockImplementation(async (authUrl: string) => {
      const u = new URL(authUrl);
      const redirect = u.searchParams.get("redirect_uri")!;
      await new Promise<void>((resolve, reject) => {
        http
          .get(`${redirect}?error=access_denied`, (res) => {
            res.resume();
            res.on("end", () => resolve());
          })
          .on("error", reject);
      });
    });
    const { runGooglePkceLogin } = await import("../../src/main/calendar/auth/google-oauth.js");
    expect(await runGooglePkceLogin()).toBe("denied");
  });

  it("returns denied on state mismatch", async () => {
    const http = await import("node:http");
    openExternal.mockImplementation(async (authUrl: string) => {
      const u = new URL(authUrl);
      const redirect = u.searchParams.get("redirect_uri")!;
      await new Promise<void>((resolve, reject) => {
        http
          .get(`${redirect}?code=x&state=wrong`, (res) => {
            res.resume();
            res.on("end", () => resolve());
          })
          .on("error", reject);
      });
    });
    const { runGooglePkceLogin } = await import("../../src/main/calendar/auth/google-oauth.js");
    expect(await runGooglePkceLogin()).toBe("denied");
  });

  it("refresh preserves refresh_token when omitted in response", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "only-access", expires_in: 100 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { ensureFreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const t = await ensureFreshGoogleAccessToken();
    expect(t?.accessToken).toBe("only-access");
    expect(t?.refreshToken).toBe("refresh");
  });

  it("refresh fails when client id empty", async () => {
    getGoogleOAuthClientId.mockReturnValue("");
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ensureFreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    expect(await ensureFreshGoogleAccessToken()).toBeNull();
    expect(clearGoogleTokens).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("token exchange failure path returns denied", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "bad" }), { status: 400 }));
    const http = await import("node:http");
    openExternal.mockImplementation(async (authUrl: string) => {
      const u = new URL(authUrl);
      const redirect = u.searchParams.get("redirect_uri")!;
      const state = u.searchParams.get("state")!;
      await new Promise<void>((resolve, reject) => {
        http
          .get(`${redirect}?code=c&state=${state}`, (res) => {
            res.resume();
            res.on("end", () => resolve());
          })
          .on("error", reject);
      });
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runGooglePkceLogin } = await import("../../src/main/calendar/auth/google-oauth.js");
    expect(await runGooglePkceLogin()).toBe("denied");
    err.mockRestore();
  });
});
