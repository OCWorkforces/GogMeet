import { describe, it, expect, vi, beforeEach } from "vitest";

const getActiveCalendarProvider = vi.hoisted(() => vi.fn());
const resetCalendarProvider = vi.hoisted(() => vi.fn());

vi.mock("../../src/main/calendar/factory.js", () => ({
  getActiveCalendarProvider,
  resetCalendarProvider,
}));
vi.mock("../../src/main/platform/os.js", () => ({
  isDarwin: () => false,
  isWin32: () => true,
}));

describe("calendar facade binds and disconnect", () => {
  beforeEach(() => {
    vi.resetModules();
    getActiveCalendarProvider.mockReset();
    resetCalendarProvider.mockReset();
  });

  it("disconnect publishes disconnected UI and rebind works", async () => {
    const provider = {
      id: "google-calendar",
      getEvents: vi.fn().mockResolvedValue({ kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] }),
      getPermissionStatus: vi.fn().mockResolvedValue("granted"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isOAuthConfigured: () => true,
      getAccountLabel: vi.fn().mockResolvedValue("u@example.com"),
      warmup: vi.fn().mockResolvedValue(undefined),
    };
    getActiveCalendarProvider.mockResolvedValue(provider);

    const calendar = await import("../../src/main/facades/calendar.js");
    calendar.rebindCalendarDefaults();
    await calendar.disconnectCalendar();
    expect(provider.disconnect).toHaveBeenCalled();
    expect(resetCalendarProvider).toHaveBeenCalled();
    const ui = calendar.getCalendarUiState();
    expect(ui.phase).toBe("disconnected");
    // After resetProvider, lazy port has no cached provider → oauthConfigured false
    expect(ui.permission).toBe("not-determined");
  });

  it("reportCalendarPollError updates UI", async () => {
    getActiveCalendarProvider.mockResolvedValue({
      id: "google-calendar",
      getEvents: vi.fn(),
      getPermissionStatus: vi.fn(),
      requestPermission: vi.fn(),
    });
    const calendar = await import("../../src/main/facades/calendar.js");
    calendar.reportCalendarPollError("network down", null);
    const ui = calendar.getCalendarUiState();
    expect(ui.phase).toBe("error");
    expect(ui.lastError).toContain("network");
  });

  it("shouldAutoRequestCalendarPermission is false on win32", async () => {
    const calendar = await import("../../src/main/facades/calendar.js");
    expect(calendar.shouldAutoRequestCalendarPermission()).toBe(false);
  });

  it("warmup and getCalendarPort", async () => {
    const warmup = vi.fn().mockResolvedValue(undefined);
    getActiveCalendarProvider.mockResolvedValue({
      id: "google-calendar",
      getEvents: vi.fn().mockResolvedValue({ kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] }),
      getPermissionStatus: vi.fn().mockResolvedValue("not-determined"),
      requestPermission: vi.fn(),
      warmup,
      isOAuthConfigured: () => false,
    });
    const calendar = await import("../../src/main/facades/calendar.js");
    calendar.rebindCalendarDefaults();
    await calendar.warmupCalendarProvider();
    expect(warmup).toHaveBeenCalled();
    const port = await calendar.getCalendarPort();
    expect(port.getEvents).toBeTypeOf("function");
  });

  it("coordinates refresh publication and result helpers through the bound fetcher", async () => {
    const getEvents = vi.fn().mockResolvedValue({
      kind: "ok",
      source: "live",
      completeness: "complete",
      observedAt: Date.now(),
      events: [],
    });
    getActiveCalendarProvider.mockResolvedValue({
      id: "google-calendar",
      getEvents,
      getPermissionStatus: vi.fn().mockResolvedValue("granted"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
      startWatch: vi.fn(),
      stopWatch: vi.fn(),
      disconnect: vi.fn(),
      reviveWatch: vi.fn(),
      isOAuthConfigured: () => true,
      isOAuthInFlight: () => false,
      getAccountLabel: vi.fn().mockResolvedValue("a@b.com"),
    });
    const calendar = await import("../../src/main/facades/calendar.js");
    calendar._resetCalendarRefreshForTest();

    const publication = await calendar.refreshCalendarPublication();
    expect(publication.publicationGeneration).toBeGreaterThanOrEqual(1);
    expect(publication.result.kind).toBe("ok");
    expect(getEvents).toHaveBeenCalled();

    const result = await calendar.getCalendarEventsResult();
    expect(result.kind).toBe("ok");
    expect(calendar.getLastPublication()?.publicationGeneration).toBeGreaterThanOrEqual(1);

    calendar.cancelActiveCalendarRefresh();
    calendar.invalidateCalendarPermissionCache();
    expect(await calendar.getCalendarPermissionStatus()).toBe("granted");
    expect(await calendar.requestCalendarPermission()).toBe("granted");
  });

  it("reportCalendarPollError keeps offline-cached phase when last events exist", async () => {
    getActiveCalendarProvider.mockResolvedValue({
      id: "google-calendar",
      getEvents: vi.fn(),
      getPermissionStatus: vi.fn(),
      requestPermission: vi.fn(),
      isOAuthConfigured: () => true,
    });
    const calendar = await import("../../src/main/facades/calendar.js");
    calendar.rebindCalendarDefaults();
    const events = [
      {
        id: "e1" as never,
        title: "Standup",
        startDate: "2026-07-30T10:00:00.000Z" as never,
        endDate: "2026-07-30T11:00:00.000Z" as never,
        calendarName: "Work",
        isAllDay: false,
      },
    ];
    calendar.reportCalendarPollError("offline", events);
    const ui = calendar.getCalendarUiState();
    expect(ui.phase).toBe("offline-cached");
    expect(ui.offline).toBe(true);
    expect(ui.events).toHaveLength(1);
  });

  it("bindCalendarUseCases rewires the refresh fetcher", async () => {
    const execute = vi.fn().mockResolvedValue({
      kind: "ok",
      source: "live",
      completeness: "partial",
      observedAt: Date.now(),
      events: [],
    });
    getActiveCalendarProvider.mockResolvedValue({
      id: "google-calendar",
      getEvents: vi.fn(),
      getPermissionStatus: vi.fn(),
      requestPermission: vi.fn(),
    });
    const calendar = await import("../../src/main/facades/calendar.js");
    calendar._resetCalendarRefreshForTest();
    calendar.bindCalendarUseCases({
      getMeetings: { execute },
    });
    const publication = await calendar.refreshCalendarPublication();
    expect(execute).toHaveBeenCalled();
    expect(publication.result).toMatchObject({ completeness: "partial" });
  });

  it("lazy port exposes optional watch and oauth hooks when present", async () => {
    const startWatch = vi.fn();
    const stopWatch = vi.fn();
    const reviveWatch = vi.fn();
    getActiveCalendarProvider.mockResolvedValue({
      id: "google-calendar",
      getEvents: vi.fn().mockResolvedValue({
        kind: "ok",
        source: "live",
        completeness: "complete",
        observedAt: Date.now(),
        events: [],
      }),
      getPermissionStatus: vi.fn().mockResolvedValue("granted"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
      startWatch,
      stopWatch,
      reviveWatch,
      isOAuthConfigured: () => true,
      isOAuthInFlight: () => false,
      getAccountLabel: vi.fn().mockResolvedValue("u@example.com"),
    });
    const calendar = await import("../../src/main/facades/calendar.js");
    calendar.rebindCalendarDefaults();
    const port = await calendar.getCalendarPort();
    const onChange = vi.fn();
    port.startWatch?.(onChange);
    // startWatch is bound after provider resolve; flush microtasks
    await Promise.resolve();
    await Promise.resolve();
    // Direct provider methods available on asCalendarPort
    expect(port.isOAuthConfigured?.()).toBe(true);
    expect(port.isOAuthInFlight?.()).toBe(false);
    expect(await port.getAccountLabel?.()).toBe("u@example.com");
    port.stopWatch?.();
    port.reviveWatch?.();
  });
});
