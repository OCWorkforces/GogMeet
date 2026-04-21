import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MeetingEvent } from "../../src/shared/models.js";

vi.mock("electron", () => ({
  Tray: vi.fn().mockImplementation(function (this: {
    setToolTip: ReturnType<typeof vi.fn>;
    setTitle: ReturnType<typeof vi.fn>;
    setImage: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    getBounds: ReturnType<typeof vi.fn>;
    popUpContextMenu: ReturnType<typeof vi.fn>;
  }) {
    this.setToolTip = vi.fn();
    this.setTitle = vi.fn();
    this.setImage = vi.fn();
    this.on = vi.fn();
    this.getBounds = vi
      .fn()
      .mockReturnValue({ x: 100, y: 0, width: 22, height: 22 });
    this.popUpContextMenu = vi.fn();
  }),
  Menu: { buildFromTemplate: vi.fn().mockReturnValue({}) },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  app: { quit: vi.fn(), showAboutPanel: vi.fn(), once: vi.fn() },
  nativeImage: {
    createFromPath: vi
      .fn()
      .mockReturnValue({ toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)), isEmpty: vi.fn().mockReturnValue(false) }),
    createEmpty: vi.fn().mockReturnValue({ addRepresentation: vi.fn(), isEmpty: vi.fn().mockReturnValue(true) }),
  },
  nativeTheme: { shouldUseDarkColors: false, on: vi.fn() },
  BrowserWindow: vi.fn().mockImplementation(function (this: {
    on: ReturnType<typeof vi.fn>;
  }) {
    this.on = vi.fn();
  }),
}));

vi.mock("../../src/main/calendar.js", () => ({
  getCalendarEventsResult: vi.fn().mockResolvedValue({ events: [] }),
}));

vi.mock("../../src/main/utils/meet-url.js", () => ({
  buildMeetUrl: vi.fn((event: MeetingEvent) => event.meetUrl || ""),
}));

vi.mock("../../src/main/settings.js", () => ({
  getSettings: vi.fn().mockReturnValue({ showTomorrowMeetings: true }),
}));

// Helper to create mock event
function createMockEvent(
  overrides: Partial<{
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    meetUrl: string | null;
    isAllDay: boolean;
    userEmail: string | null;
  }> = {},
): MeetingEvent {
  const now = new Date();
  const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);

  const defaults = {
    id: "test-id",
    title: "Test Meeting",
    startDate: now.toISOString(),
    endDate: in1Hour.toISOString(),
    meetUrl: "https://meet.google.com/abc-def-ghi",
    isAllDay: false,
    userEmail: "user@example.com",
  };

  return { ...defaults, ...overrides } as MeetingEvent;
}

// Pure function tests - formatRemainingTime
describe("formatRemainingTime", () => {
  let formatRemainingTime: (totalMins: number) => string;

  beforeEach(async () => {
    vi.resetModules();
    const trayModule = await import("../../src/main/tray.js");
    formatRemainingTime = trayModule.formatRemainingTime;
  });

  it("returns '0m' for zero or negative minutes", () => {
    expect(formatRemainingTime(0)).toBe("0m");
    expect(formatRemainingTime(-1)).toBe("0m");
    expect(formatRemainingTime(-100)).toBe("0m");
  });

  it("formats minutes only when < 60", () => {
    expect(formatRemainingTime(1)).toBe("1m");
    expect(formatRemainingTime(30)).toBe("30m");
    expect(formatRemainingTime(59)).toBe("59m");
  });

  it("formats hours only when exactly on the hour", () => {
    expect(formatRemainingTime(60)).toBe("1h");
    expect(formatRemainingTime(120)).toBe("2h");
    expect(formatRemainingTime(180)).toBe("3h");
  });

  it("formats hours and minutes when both present", () => {
    expect(formatRemainingTime(61)).toBe("1h 1m");
    expect(formatRemainingTime(90)).toBe("1h 30m");
    expect(formatRemainingTime(125)).toBe("2h 5m");
    expect(formatRemainingTime(3665)).toBe("61h 5m");
  });

  it("formats 0 as '0m'", () => {
    expect(formatRemainingTime(0)).toBe("0m");
  });
});

// Tray module exports
describe("tray module exports", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exports setupTray, updateTrayTitle, and formatRemainingTime functions", async () => {
    const trayModule = await import("../../src/main/tray.js");

    expect(typeof trayModule.setupTray).toBe("function");
    expect(typeof trayModule.updateTrayTitle).toBe("function");
    expect(typeof trayModule.formatRemainingTime).toBe("function");
  });

  it("setupTray creates a Tray instance", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { Tray } = await import("electron");

    const mockWindow = {} as Parameters<typeof setupTray>[0];
    setupTray(mockWindow);

    expect(Tray).toHaveBeenCalled();
  });

  it("setupTray sets tooltip to 'Google Meet'", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { Tray } = await import("electron");

    const mockWindow = {} as Parameters<typeof setupTray>[0];
    setupTray(mockWindow);

    const trayInstance = (Tray as ReturnType<typeof vi.fn>).mock.results[0]
      .value;
    expect(trayInstance.setToolTip).toHaveBeenCalledWith("GogMeet");
  });

  it("setupTray registers nativeTheme.on('updated') handler", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { nativeTheme } = await import("electron");

    const mockWindow = {} as Parameters<typeof setupTray>[0];
    setupTray(mockWindow);

    expect(nativeTheme.on).toHaveBeenCalledWith(
      "updated",
      expect.any(Function),
    );
  });
});
