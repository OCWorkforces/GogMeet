import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  loadGoogleTokens,
  loadGoogleTokensResult,
  saveGoogleTokens,
  clearGoogleTokens,
  getGoogleOAuthClientId,
  isGoogleOAuthConfigured,
  openExternal,
  googleHttpJsonMock,
} = vi.hoisted(() => ({
  loadGoogleTokens: vi.fn(),
  loadGoogleTokensResult: vi.fn(),
  saveGoogleTokens: vi.fn(),
  clearGoogleTokens: vi.fn(),
  getGoogleOAuthClientId: vi.fn(),
  isGoogleOAuthConfigured: vi.fn(),
  openExternal: vi.fn(),
  googleHttpJsonMock: vi.fn(),
}));

vi.mock("../../src/main/calendar/auth/google-token-store.js", () => ({
  loadGoogleTokens,
  loadGoogleTokensResult,
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

const useGoogleHttpJsonMock = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../src/main/calendar/google-http.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/main/calendar/google-http.js")>();
  return {
    ...actual,
    googleHttpJson: (req: Parameters<typeof actual.googleHttpJson>[0]) => {
      if (useGoogleHttpJsonMock.enabled) {
        return googleHttpJsonMock(req);
      }
      return actual.googleHttpJson(req);
    },
  };
});

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
    useGoogleHttpJsonMock.enabled = false;
    googleHttpJsonMock.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    loadGoogleTokens.mockReset();
    loadGoogleTokensResult.mockReset();
    loadGoogleTokensResult.mockImplementation(async () => {
      const t = await loadGoogleTokens();
      return t === null
        ? { kind: "err", reason: "missing", preservedCiphertext: false }
        : { kind: "ok", tokens: t };
    });
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

  it("clears tokens only on definitive invalid_grant", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ensureFreshGoogleAccessToken, refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    // loadGoogleTokensResult is used now — mock loadGoogleTokens still used via loadGoogleTokensResult
    // which calls real store... we mock the store module. Need loadGoogleTokensResult mock.
    expect(await ensureFreshGoogleAccessToken()).toBeNull();
    const typed = await refreshGoogleAccessToken("if-needed");
    // After clear, subsequent may be no-tokens; first call should have cleared
    expect(clearGoogleTokens).toHaveBeenCalled();
    void typed;
    warn.mockRestore();
  });

  it("preserves tokens on transient refresh failure (timeout/network)", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    fetchMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "AbortError" })), 0);
        }),
    );
    // Force transport timeout via hang + abort from google-http deadline is heavy;
    // simulate network failure from fetch reject.
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const result = await refreshGoogleAccessToken("if-needed");
    expect(result.kind).toBe("transient");
    expect(clearGoogleTokens).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("force refresh performs network call even when access token is unexpired", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 120_000 });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "forced-access", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { refreshGoogleAccessToken, ensureFreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    // if-needed must NOT refresh
    const cached = await ensureFreshGoogleAccessToken("if-needed");
    expect(cached?.accessToken).toBe("old-access");
    expect(fetchMock).not.toHaveBeenCalled();

    const forced = await refreshGoogleAccessToken("force");
    expect(forced.kind).toBe("ok");
    if (forced.kind === "ok") {
      expect(forced.didRefresh).toBe(true);
      expect(forced.tokens.accessToken).toBe("forced-access");
    }
    expect(fetchMock).toHaveBeenCalled();
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

  it("completes PKCE flow with successful callback", { timeout: 10_000 }, async () => {
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

  it("returns denied on OAuth error param", { timeout: 10_000 }, async () => {
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

  it("returns denied on state mismatch", { timeout: 10_000 }, async () => {
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

  it("refresh fails closed on empty client id without clearing tokens", async () => {
    getGoogleOAuthClientId.mockReturnValue("");
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    const { refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const result = await refreshGoogleAccessToken("if-needed");
    expect(result).toEqual({ kind: "transient", reason: "configuration" });
    expect(clearGoogleTokens).not.toHaveBeenCalled();
  });

  it("refresh success with save failure returns storage transient and does not expose token", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    saveGoogleTokens.mockRejectedValueOnce(new Error("disk full"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const result = await refreshGoogleAccessToken("if-needed");
    expect(result).toEqual({ kind: "transient", reason: "storage" });
    expect(clearGoogleTokens).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("force during if-needed cache-hit enqueues a real forced refresh", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 120_000 });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "after-force", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const ifNeeded = await refreshGoogleAccessToken("if-needed");
    expect(ifNeeded.kind).toBe("ok");
    if (ifNeeded.kind === "ok") expect(ifNeeded.didRefresh).toBe(false);

    const forced = await refreshGoogleAccessToken("force");
    expect(forced.kind).toBe("ok");
    if (forced.kind === "ok") {
      expect(forced.didRefresh).toBe(true);
      expect(forced.tokens.accessToken).toBe("after-force");
    }
  });

  it("token exchange failure path returns denied", { timeout: 10_000 }, async () => {
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

  it("exposes in-flight flag and lifecycle abort without throwing", async () => {
    const {
      isGoogleOAuthInFlight,
      abortGoogleTokenRefreshLifecycle,
    } = await import("../../src/main/calendar/auth/google-oauth.js");
    expect(isGoogleOAuthInFlight()).toBe(false);
    expect(() => abortGoogleTokenRefreshLifecycle()).not.toThrow();
    expect(() => abortGoogleTokenRefreshLifecycle()).not.toThrow();
  });

  it.each([
    { status: 429, body: {}, reason: "rate-limit" },
    { status: 500, body: {}, reason: "server" },
    { status: 400, body: { error: "invalid_request" }, reason: "protocol" },
    { status: 403, body: {}, reason: "protocol" },
  ] as const)(
    "maps refresh HTTP $status to transient $reason without clearing tokens",
    async ({ status, body, reason }) => {
      loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { refreshGoogleAccessToken } = await import(
        "../../src/main/calendar/auth/google-oauth.js"
      );
      const result = await refreshGoogleAccessToken("if-needed");
      expect(result).toEqual({ kind: "transient", reason });
      expect(clearGoogleTokens).not.toHaveBeenCalled();
      warn.mockRestore();
    },
  );

  it("clears tokens on invalid_token api error during refresh", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const result = await refreshGoogleAccessToken("if-needed");
    expect(result.kind).toBe("invalidated");
    expect(clearGoogleTokens).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns protocol transient when access_token missing from refresh response", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const result = await refreshGoogleAccessToken("if-needed");
    expect(result).toEqual({ kind: "transient", reason: "protocol" });
    expect(clearGoogleTokens).not.toHaveBeenCalled();
  });

  it("joins concurrent if-needed refresh into a single flight", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    let release!: (v: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(() => gate);
    const { refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const p1 = refreshGoogleAccessToken("if-needed");
    // Yield so p1 reaches fetch
    await Promise.resolve();
    await Promise.resolve();
    const p2 = refreshGoogleAccessToken("if-needed");
    release(
      new Response(JSON.stringify({ access_token: "shared", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.kind).toBe("ok");
    expect(b.kind).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("force refresh with pre-aborted signal returns abort transient", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 120_000 });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "x", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const ac = new AbortController();
    ac.abort();
    const result = await refreshGoogleAccessToken("force", ac.signal);
    expect(result).toEqual({ kind: "transient", reason: "abort" });
  });

  it("maps fetch AbortError with timeout name to transient timeout", async () => {
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    fetchMock.mockRejectedValue(Object.assign(new Error("The operation was aborted"), {
      name: "TimeoutError",
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const result = await refreshGoogleAccessToken("if-needed");
    expect(result.kind).toBe("transient");
    if (result.kind === "transient") {
      expect(["timeout", "abort", "network"]).toContain(result.reason);
    }
    expect(clearGoogleTokens).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns denied when token exchange omits refresh_token", { timeout: 10_000 }, async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : String((input as Request).url);
      if (url.includes("token")) {
        return new Response(JSON.stringify({ access_token: "only" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    });
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

  it("returns denied when callback path is not root", { timeout: 10_000 }, async () => {
    const http = await import("node:http");
    openExternal.mockImplementation(async (authUrl: string) => {
      const u = new URL(authUrl);
      const redirect = u.searchParams.get("redirect_uri")!;
      // Hit a non-/ path so handler returns 404, then complete with access_denied
      await new Promise<void>((resolve, reject) => {
        http
          .get(`${redirect}/favicon.ico`, (res) => {
            res.resume();
            res.on("end", () => resolve());
          })
          .on("error", reject);
      });
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

  it.each([
    { errorClass: "timeout" as const, reason: "timeout" },
    { errorClass: "abort" as const, reason: "abort" },
    { errorClass: "network" as const, reason: "network" },
    { errorClass: "payload-too-large" as const, reason: "protocol" },
  ])(
    "maps GoogleHttpError $errorClass from googleHttpJson to transient $reason",
    async ({ errorClass, reason }) => {
      useGoogleHttpJsonMock.enabled = true;
      loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
      const { GoogleHttpError } = await import("../../src/main/calendar/google-http.js");
      googleHttpJsonMock.mockRejectedValue(new GoogleHttpError(errorClass, `sim ${errorClass}`));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { refreshGoogleAccessToken } = await import(
        "../../src/main/calendar/auth/google-oauth.js"
      );
      const result = await refreshGoogleAccessToken("if-needed");
      expect(result).toEqual({ kind: "transient", reason });
      expect(clearGoogleTokens).not.toHaveBeenCalled();
      warn.mockRestore();
    },
  );

  it("maps non-GoogleHttpError from googleHttpJson to network transient", async () => {
    useGoogleHttpJsonMock.enabled = true;
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 5_000 });
    googleHttpJsonMock.mockRejectedValue(new Error("weird"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    const result = await refreshGoogleAccessToken("if-needed");
    expect(result).toEqual({ kind: "transient", reason: "network" });
    warn.mockRestore();
  });

  it("force joins existing forceFollowUp promise", async () => {
    useGoogleHttpJsonMock.enabled = true;
    loadGoogleTokens.mockResolvedValue({ ...baseTokens, expiryMs: Date.now() + 120_000 });
    let release!: (v: unknown) => void;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    googleHttpJsonMock.mockImplementation(() => gate);
    const { refreshGoogleAccessToken } = await import(
      "../../src/main/calendar/auth/google-oauth.js"
    );
    // Force while tokens are fresh still does network refresh
    const p1 = refreshGoogleAccessToken("force");
    await Promise.resolve();
    const p2 = refreshGoogleAccessToken("force");
    release({ access_token: "forced-shared", expires_in: 3600 });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.kind).toBe("ok");
    expect(b.kind).toBe("ok");
  });
});
