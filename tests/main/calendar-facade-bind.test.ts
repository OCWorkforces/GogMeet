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
});
