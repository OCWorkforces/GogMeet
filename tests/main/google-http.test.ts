import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GOOGLE_HTTP_BODY_LIMIT_BYTES,
  GOOGLE_HTTP_REQUEST_TIMEOUT_MS,
  GOOGLE_POLL_BUDGET_MS,
  GoogleHttpError,
  googleHttpRequest,
  googleHttpJson,
  parseGoogleApiErrorCode,
  createPollBudgetSignal,
} from "../../src/main/calendar/google-http.js";

describe("google-http constants", () => {
  it("exports initial safety ceilings", () => {
    expect(GOOGLE_HTTP_REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(GOOGLE_HTTP_BODY_LIMIT_BYTES).toBe(8 * 1024 * 1024);
    expect(GOOGLE_POLL_BUDGET_MS).toBe(60_000);
  });
});

describe("parseGoogleApiErrorCode", () => {
  it("extracts OAuth error code without retaining body", () => {
    expect(parseGoogleApiErrorCode(JSON.stringify({ error: "invalid_grant" }))).toBe(
      "invalid_grant",
    );
  });

  it("extracts nested error.status / short message", () => {
    expect(
      parseGoogleApiErrorCode(JSON.stringify({ error: { status: "PERMISSION_DENIED" } })),
    ).toBe("PERMISSION_DENIED");
    expect(
      parseGoogleApiErrorCode(JSON.stringify({ error: { message: "short reason" } })),
    ).toBe("short reason");
  });

  it("returns undefined for oversized or invalid bodies", () => {
    expect(parseGoogleApiErrorCode("not-json")).toBeUndefined();
    expect(parseGoogleApiErrorCode("x".repeat(5000))).toBeUndefined();
    expect(parseGoogleApiErrorCode("")).toBeUndefined();
    expect(parseGoogleApiErrorCode("null")).toBeUndefined();
    expect(parseGoogleApiErrorCode(JSON.stringify({ error: { message: "x".repeat(200) } }))).toBeUndefined();
  });
});

describe("googleHttpRequest", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  function mockFetch(
    impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  ): void {
    globalThis.fetch = vi.fn(impl).As<typeof fetch>();
  }

  /** Hang until AbortSignal fires (mirrors real fetch abort behavior). */
  function hangUntilAbort(init?: RequestInit): Promise<Response> {
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new DOMException("Aborted", "AbortError"),
          );
        },
        { once: true },
      );
    });
  }

  it("returns status and body for successful JSON response", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const res = await googleHttpRequest({ url: "https://example.test/ok" });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.bodyText)).toEqual({ items: [] });
  });

  it("succeeds at body limit - 1 and limit", async () => {
    const limit = 1024;
    for (const size of [limit - 1, limit]) {
      mockFetch(async () => new Response("a".repeat(size), { status: 200 }));
      const res = await googleHttpRequest({
        url: "https://example.test/body",
        bodyLimitBytes: limit,
      });
      expect(res.bodyText.length).toBe(size);
    }
  });

  it("throws payload-too-large at body limit + 1", async () => {
    const limit = 512;
    mockFetch(async () => new Response("b".repeat(limit + 1), { status: 200 }));
    await expect(
      googleHttpRequest({ url: "https://example.test/big", bodyLimitBytes: limit }),
    ).rejects.toMatchObject({
      name: "GoogleHttpError",
      errorClass: "payload-too-large",
    });
  });

  it("times out when fetch never resolves", async () => {
    mockFetch((_input, init) => hangUntilAbort(init));
    const promise = googleHttpRequest({
      url: "https://example.test/hang",
      timeoutMs: 100,
    });
    const assertion = expect(promise).rejects.toMatchObject({
      errorClass: "timeout",
    });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it("aborts on upstream AbortSignal", async () => {
    mockFetch((_input, init) => hangUntilAbort(init));
    const controller = new AbortController();
    const promise = googleHttpRequest({
      url: "https://example.test/abort",
      signal: controller.signal,
      timeoutMs: 10_000,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({
      errorClass: "abort",
    });
  });

  it("classifies 401 as auth via googleHttpJson", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 }),
    );
    await expect(googleHttpJson({ url: "https://example.test/401" })).rejects.toMatchObject({
      errorClass: "auth",
      status: 401,
      apiErrorCode: "invalid_token",
    });
  });

  it("classifies 429 and 5xx", async () => {
    mockFetch(async () => new Response("{}", { status: 429 }));
    await expect(googleHttpJson({ url: "https://example.test/429" })).rejects.toMatchObject({
      errorClass: "rate-limit",
    });

    mockFetch(async () => new Response("{}", { status: 503 }));
    await expect(googleHttpJson({ url: "https://example.test/503" })).rejects.toMatchObject({
      errorClass: "server",
    });
  });

  it("rejects malformed JSON on success status", async () => {
    mockFetch(async () => new Response("not-json", { status: 200 }));
    await expect(googleHttpJson({ url: "https://example.test/badjson" })).rejects.toMatchObject({
      errorClass: "protocol",
    });
  });

  it("allows a successful request immediately after a timeout", async () => {
    let calls = 0;
    mockFetch((_input, init) => {
      calls++;
      if (calls === 1) return hangUntilAbort(init);
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const first = googleHttpRequest({ url: "https://example.test/t1", timeoutMs: 50 });
    const firstAssert = expect(first).rejects.toMatchObject({ errorClass: "timeout" });
    await vi.advanceTimersByTimeAsync(50);
    await firstAssert;

    const second = await googleHttpRequest({ url: "https://example.test/t2", timeoutMs: 50 });
    expect(second.ok).toBe(true);
  });

  it("aborts immediately when the upstream signal is already aborted", async () => {
    mockFetch((_input, init) => hangUntilAbort(init));
    const controller = new AbortController();
    controller.abort();
    await expect(
      googleHttpRequest({
        url: "https://example.test/pre-aborted",
        signal: controller.signal,
        timeoutMs: 10_000,
      }),
    ).rejects.toMatchObject({ errorClass: "abort" });
  });

  it("classifies fetch TypeError as network", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(googleHttpRequest({ url: "https://example.test/net" })).rejects.toMatchObject({
      errorClass: "network",
    });
  });

  it("classifies 403 as auth and other 4xx as protocol", async () => {
    mockFetch(async () => new Response("{}", { status: 403 }));
    await expect(googleHttpJson({ url: "https://example.test/403" })).rejects.toMatchObject({
      errorClass: "auth",
      status: 403,
    });

    mockFetch(async () => new Response(JSON.stringify({ error: "badRequest" }), { status: 400 }));
    await expect(googleHttpJson({ url: "https://example.test/400" })).rejects.toMatchObject({
      errorClass: "protocol",
      status: 400,
      apiErrorCode: "badRequest",
    });
  });

  it("posts URLSearchParams and reads streamed bodies with empty chunks", async () => {
    mockFetch(async (_url, init) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(URLSearchParams);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array());
          controller.enqueue(new TextEncoder().encode('{"ok":true}'));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    });
    const res = await googleHttpRequest({
      url: "https://example.test/post",
      method: "POST",
      body: new URLSearchParams({ grant_type: "refresh_token" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(res.ok).toBe(true);
    expect(res.bodyText).toContain("ok");
  });

  it("maps AbortError and TimeoutError from fetch", async () => {
    mockFetch(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    await expect(googleHttpRequest({ url: "https://example.test/ae" })).rejects.toMatchObject({
      errorClass: "abort",
    });

    mockFetch(async () => {
      const err = new Error("timed out");
      err.name = "TimeoutError";
      throw err;
    });
    // When signal is not aborted, TimeoutError from fetch becomes network unless mapped via abort reason.
    // Force via aborted signal reason:
    const controller = new AbortController();
    controller.abort(
      Object.assign(new Error("deadline"), { name: "TimeoutError" }),
    );
    mockFetch((_input, init) => hangUntilAbort(init));
    await expect(
      googleHttpRequest({
        url: "https://example.test/to",
        signal: controller.signal,
        timeoutMs: 10_000,
      }),
    ).rejects.toMatchObject({ errorClass: "timeout" });
  });
});

describe("createPollBudgetSignal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts after budget ms", () => {
    const { signal, cleanup } = createPollBudgetSignal(100);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(100);
    expect(signal.aborted).toBe(true);
    cleanup();
  });
});

describe("GoogleHttpError redaction", () => {
  it("never stores arbitrary body text on the error instance", () => {
    const err = new GoogleHttpError("auth", "Google HTTP auth failure (401)", {
      status: 401,
      apiErrorCode: "invalid_token",
    });
    expect(JSON.stringify(err)).not.toMatch(/Bearer|refresh_token|access_token/i);
    expect(err.message).not.toContain("secret");
  });

  it("preserves cause when provided", () => {
    const cause = new Error("upstream");
    const err = new GoogleHttpError("network", "Google HTTP network failure", { cause });
    expect(err.cause).toBe(cause);
    expect(err.status).toBeUndefined();
  });
});

describe("createPollBudgetSignal defaults", () => {
  it("uses default budget and cleanup is idempotent", () => {
    vi.useFakeTimers();
    const { signal, cleanup } = createPollBudgetSignal();
    expect(signal.aborted).toBe(false);
    cleanup();
    cleanup();
    vi.useRealTimers();
  });
});
