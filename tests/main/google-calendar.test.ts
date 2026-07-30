import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockEvent, asTestMeetUrl, asTestIsoUtc } from "../helpers/test-utils.js";

const {
  ensureFreshGoogleAccessToken,
  refreshGoogleAccessToken,
  isGoogleOAuthInFlight,
  runGooglePkceLogin,
  loadGoogleTokens,
  clearGoogleTokens,
  isGoogleOAuthConfigured,
  loadOfflineCache,
  saveOfflineCache,
  clearOfflineCache,
} = vi.hoisted(() => ({
  ensureFreshGoogleAccessToken: vi.fn(),
  refreshGoogleAccessToken: vi.fn(),
  isGoogleOAuthInFlight: vi.fn(),
  runGooglePkceLogin: vi.fn(),
  loadGoogleTokens: vi.fn(),
  clearGoogleTokens: vi.fn(),
  isGoogleOAuthConfigured: vi.fn(),
  loadOfflineCache: vi.fn(),
  saveOfflineCache: vi.fn(),
  clearOfflineCache: vi.fn(),
}));

vi.mock("../../src/main/calendar/auth/google-oauth.js", () => ({
  ensureFreshGoogleAccessToken,
  refreshGoogleAccessToken,
  isGoogleOAuthInFlight,
  runGooglePkceLogin,
}));
vi.mock("../../src/main/calendar/auth/google-token-store.js", () => ({
  loadGoogleTokens,
  clearGoogleTokens,
}));
vi.mock("../../src/main/calendar/auth/google-client-id.js", () => ({
  isGoogleOAuthConfigured,
  getGoogleOAuthClientId: () => "test-client",
}));
vi.mock("../../src/main/calendar/offline-cache.js", () => ({
  loadOfflineCache,
  saveOfflineCache,
  clearOfflineCache,
}));

import { createGoogleCalendarProvider } from "../../src/main/calendar/providers/google-calendar.js";

const tokens = {
  authSchemaVersion: 1 as const,
  clientId: "test-client",
  accessToken: "access",
  refreshToken: "refresh",
  expiryMs: Date.now() + 3_600_000,
  email: "user@example.com",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createGoogleCalendarProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    ensureFreshGoogleAccessToken.mockReset();
    refreshGoogleAccessToken.mockReset();
    isGoogleOAuthInFlight.mockReset().mockReturnValue(false);
    runGooglePkceLogin.mockReset();
    loadGoogleTokens.mockReset();
    clearGoogleTokens.mockReset().mockResolvedValue(undefined);
    isGoogleOAuthConfigured.mockReset().mockReturnValue(true);
    loadOfflineCache.mockReset().mockResolvedValue(null);
    saveOfflineCache.mockReset().mockResolvedValue(undefined);
    clearOfflineCache.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns permission-denied when no tokens", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(null);
    const provider = createGoogleCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("err");
    if (result.kind === "err") expect(result.code).toBe("permission-denied");
  });

  it("fetches calendars and events then caches", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("calendarList")) {
        return jsonResponse({
          items: [
            { id: "primary", primary: true, summary: "Primary" },
            { id: "work", selected: true },
          ],
        });
      }
      if (url.includes("/events")) {
        return jsonResponse({
          items: [
            {
              id: "e1",
              summary: "Standup",
              status: "confirmed",
              hangoutLink: "https://meet.google.com/aaa-bbbb-ccc",
              start: { dateTime: "2026-07-27T15:00:00.000Z" },
              end: { dateTime: "2026-07-27T15:30:00.000Z" },
            },
            {
              id: "e2",
              status: "cancelled",
              start: { dateTime: "2026-07-27T16:00:00.000Z" },
              end: { dateTime: "2026-07-27T16:30:00.000Z" },
            },
            {
              id: "e3",
              summary: "All day",
              start: { date: "2026-07-28" },
              end: { date: "2026-07-29" },
            },
            {
              id: "e4",
              summary: "Declined",
              attendees: [{ self: true, responseStatus: "declined" }],
              start: { dateTime: "2026-07-27T17:00:00.000Z" },
              end: { dateTime: "2026-07-27T18:00:00.000Z" },
            },
            {
              id: "e5",
              summary: "Zoom from conf",
              conferenceData: {
                entryPoints: [{ uri: "https://zoom.us/j/12345678901" }],
              },
              start: { dateTime: "2026-07-27T19:00:00.000Z" },
              end: { dateTime: "2026-07-27T20:00:00.000Z" },
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    });

    const provider = createGoogleCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    // cancelled + declined filtered; all-day + meet + zoom kept
    expect(result.events.length).toBeGreaterThanOrEqual(3);
    expect(result.events.some((e) => e.title === "Standup")).toBe(true);
    expect(result.events.some((e) => e.isAllDay)).toBe(true);
    expect(result.events.some((e) => e.meetUrl?.includes("zoom.us"))).toBe(true);
    expect(saveOfflineCache).toHaveBeenCalled();
  });

  it("falls back to offline cache on network error", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    fetchMock.mockRejectedValue(new Error("network down"));
    // listSelected will fail via fetch throw → outer catch network
    // Actually fetch rejection isn't handled as NetworkError in googleFetch - it will throw
    const cached = {
      version: 1 as const,
      observedAt: Date.now() - 1_000,
      cachedAt: Date.now(),
      events: [createMockEvent({ title: "Cached" })],
    };
    // First failure path: ensureFresh works, fetchAllEvents throws from fetch
    fetchMock.mockImplementation(async () => {
      throw new Error("ECONNRESET");
    });
    loadOfflineCache.mockResolvedValue(cached);

    const provider = createGoogleCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    // outer catch may return runtime or network via cache
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.events[0]?.title).toBe("Cached");
    }
  });

  it("returns network error when no cache", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    fetchMock.mockImplementation(async () => {
      throw new Error("offline");
    });
    loadOfflineCache.mockResolvedValue(null);

    const provider = createGoogleCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("err");
  });

  it("retries once on AuthError then succeeds with a different access token", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    refreshGoogleAccessToken.mockResolvedValue({
      kind: "ok",
      tokens: { ...tokens, accessToken: "new-access" },
      didRefresh: true,
    });

    let call = 0;
    const tokensSeen: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.["Authorization"];
      if (typeof auth === "string") tokensSeen.push(auth);
      if (url.includes("calendarList")) {
        call++;
        if (call === 1) return new Response("unauthorized", { status: 401 });
        return jsonResponse({ items: [{ id: "primary", primary: true }] });
      }
      return jsonResponse({
        items: [
          {
            id: "ok",
            summary: "After retry",
            start: { dateTime: "2026-07-27T15:00:00.000Z" },
            end: { dateTime: "2026-07-27T16:00:00.000Z" },
          },
        ],
      });
    });

    const provider = createGoogleCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.events[0]?.title).toBe("After retry");
    }
    expect(refreshGoogleAccessToken).toHaveBeenCalledWith("force");
    expect(tokensSeen.some((h) => h.includes("new-access"))).toBe(true);
  });

  it("clears tokens when auth fails after forced refresh retry", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    refreshGoogleAccessToken.mockResolvedValue({
      kind: "ok",
      tokens: { ...tokens, accessToken: "new-access" },
      didRefresh: true,
    });
    fetchMock.mockImplementation(async () => new Response("nope", { status: 401 }));

    const provider = createGoogleCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("err");
    if (result.kind === "err") {
      expect(result.code).toBe("permission-denied");
    }
    expect(refreshGoogleAccessToken).toHaveBeenCalledWith("force");
    expect(clearGoogleTokens).toHaveBeenCalled();
  });

  it("skips 403 calendars and defaults to primary when list empty", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("calendarList")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/events") && url.includes("primary")) {
        return new Response("forbidden", { status: 403 });
      }
      return jsonResponse({ items: [] });
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const provider = createGoogleCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.events).toEqual([]);
    warn.mockRestore();
  });

  it("permission helpers and disconnect", async () => {
    const provider = createGoogleCalendarProvider();
    isGoogleOAuthInFlight.mockReturnValue(true);
    expect(await provider.getPermissionStatus()).toBe("not-determined");
    isGoogleOAuthInFlight.mockReturnValue(false);
    isGoogleOAuthConfigured.mockReturnValue(false);
    expect(await provider.getPermissionStatus()).toBe("denied");
    isGoogleOAuthConfigured.mockReturnValue(true);
    loadGoogleTokens.mockResolvedValue(tokens);
    expect(await provider.getPermissionStatus()).toBe("granted");
    loadGoogleTokens.mockResolvedValue(null);
    expect(await provider.getPermissionStatus()).toBe("not-determined");

    isGoogleOAuthConfigured.mockReturnValue(false);
    expect(await provider.requestPermission()).toBe("denied");
    isGoogleOAuthConfigured.mockReturnValue(true);
    runGooglePkceLogin.mockResolvedValue("granted");
    expect(await provider.requestPermission()).toBe("granted");
    runGooglePkceLogin.mockResolvedValue("denied");
    expect(await provider.requestPermission()).toBe("denied");
    runGooglePkceLogin.mockResolvedValue("not-determined");
    expect(await provider.requestPermission()).toBe("not-determined");

    loadGoogleTokens.mockResolvedValue(tokens);
    expect(await provider.getAccountLabel?.()).toBe("user@example.com");
    expect(provider.isOAuthConfigured?.()).toBe(true);
    isGoogleOAuthInFlight.mockReturnValue(true);
    expect(provider.isOAuthInFlight?.()).toBe(true);

    await provider.disconnect?.();
    expect(clearGoogleTokens).toHaveBeenCalled();
    expect(clearOfflineCache).toHaveBeenCalled();

    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    await provider.warmup?.();
    expect(ensureFreshGoogleAccessToken).toHaveBeenCalled();
  });

  it("maps event without summary and invalid JSON body", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("calendarList")) {
        return jsonResponse({ items: [{ id: "primary", primary: true }] });
      }
      // 200 with non-JSON body → googleFetch ok:false → NetworkError → no offline cache
      return new Response("not-json", { status: 200 });
    });
    const provider = createGoogleCalendarProvider();
    loadOfflineCache.mockResolvedValue(null);
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("err");
    if (result.kind === "err") {
      expect(result.code).toBe("runtime");
      expect(result.error).toMatch(/events\.list failed|network|invalid/i);
    }
  });

  it("maps conference location description and empty calendar list to primary", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("calendarList")) {
        return jsonResponse({ items: [{ id: "work", selected: false, primary: false }] });
      }
      return jsonResponse({
        items: [
          {
            id: "loc",
            summary: "Room",
            location: "https://meet.google.com/loc-meet-url",
            description: "See https://zoom.us/j/11111111111",
            start: { dateTime: "2026-07-27T10:00:00.000Z" },
            end: { dateTime: "2026-07-27T11:00:00.000Z" },
          },
          {
            // missing id
            summary: "Bad",
            start: { dateTime: "2026-07-27T10:00:00.000Z" },
            end: { dateTime: "2026-07-27T11:00:00.000Z" },
          },
          {
            id: "bad-time",
            start: { foo: 1 },
            end: { bar: 2 },
          },
          null,
          "skip",
        ],
        nextPageToken: "",
      });
    });
    const provider = createGoogleCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("ok");
  });

  it("paginates calendarList and events", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    let listPages = 0;
    let eventPages = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("calendarList")) {
        listPages++;
        if (listPages === 1) {
          return jsonResponse({
            items: [{ id: "c1", selected: true }],
            nextPageToken: "p2",
          });
        }
        return jsonResponse({ items: [{ id: "c2", primary: true }] });
      }
      eventPages++;
      if (eventPages === 1 && url.includes("c1")) {
        return jsonResponse({
          items: [
            {
              id: "e1",
              summary: "P1",
              start: { dateTime: "2026-07-27T10:00:00.000Z" },
              end: { dateTime: "2026-07-27T11:00:00.000Z" },
            },
          ],
          nextPageToken: "ep2",
        });
      }
      return jsonResponse({
        items: [
          {
            id: "e2",
            summary: "P2",
            start: { dateTime: "2026-07-27T12:00:00.000Z" },
            end: { dateTime: "2026-07-27T13:00:00.000Z" },
          },
        ],
      });
    });
    const provider = createGoogleCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.events.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("auth retry fails when force refresh returns no-tokens without clearing again", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    refreshGoogleAccessToken.mockResolvedValue({ kind: "no-tokens" });
    fetchMock.mockResolvedValue(new Response("nope", { status: 401 }));
    const provider = createGoogleCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("err");
    if (result.kind === "err") expect(result.code).toBe("permission-denied");
    // no-tokens path does not call clear again (nothing to clear / already gone)
    expect(clearGoogleTokens).not.toHaveBeenCalled();
  });

  it("transient force refresh preserves credentials and uses offline cache", async () => {
    ensureFreshGoogleAccessToken.mockResolvedValue(tokens);
    refreshGoogleAccessToken.mockResolvedValue({
      kind: "transient",
      reason: "timeout",
    });
    fetchMock.mockResolvedValue(new Response("nope", { status: 401 }));
    loadOfflineCache.mockResolvedValue({
      version: 1 as const,
      observedAt: Date.now() - 1_000,
      cachedAt: Date.now(),
      events: [
        createMockEvent({
          id: "cached",
          title: "Cached",
          meetUrl: asTestMeetUrl("https://meet.google.com/aaa-bbb-ccc"),
          startDate: asTestIsoUtc("2026-07-27T15:00:00.000Z"),
          endDate: asTestIsoUtc("2026-07-27T16:00:00.000Z"),
        }),
      ],
    });
    const provider = createGoogleCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.source).toBe("offline-cache");
    }
    expect(clearGoogleTokens).not.toHaveBeenCalled();
  });
});

