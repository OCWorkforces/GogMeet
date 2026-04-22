import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock electron before importing shortcuts
vi.mock("electron", () => ({
  globalShortcut: {
    register: vi.fn().mockReturnValue(true),
    unregister: vi.fn(),
  },
  app: {
    on: vi.fn(),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock electron-log
vi.mock("electron-log", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock calendar module
vi.mock("../../src/main/calendar.js", () => ({
  getCalendarEventsResult: vi.fn().mockResolvedValue({
    events: [
      {
        id: "evt-1",
        title: "Team Standup",
        startDate: new Date(Date.now() + 3600000).toISOString(),
        endDate: new Date(Date.now() + 7200000).toISOString(),
        meetUrl: "https://meet.google.com/abc-def-ghi",
        calendarName: "Work",
        isAllDay: false,
        userEmail: "user@example.com",
      },
    ],
  }),
}));

// Mock meet-url module
vi.mock("../../src/main/utils/meet-url.js", () => ({
  buildMeetUrl: vi
    .fn()
    .mockReturnValue(
      "https://meet.google.com/abc-def-ghi?authuser=user%40example.com",
    ),
}));

describe("shortcuts", () => {
  let registerShortcuts: () => void;
  let globalShortcut: { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };
  let app: { on: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const mod = await import("../../src/main/shortcuts.js");
    registerShortcuts = mod.registerShortcuts;

    const electron = await import("electron");
    globalShortcut = electron.globalShortcut as unknown as typeof globalShortcut;
    app = electron.app as unknown as typeof app;
  });

  it("registers global shortcut on first call", () => {
    registerShortcuts();
    expect(globalShortcut.register).toHaveBeenCalledWith(
      "CmdOrCtrl+Shift+M",
      expect.any(Function),
    );
  });

  it("does not register twice on subsequent calls", () => {
    registerShortcuts();
    registerShortcuts();
    expect(globalShortcut.register).toHaveBeenCalledTimes(1);
  });

  describe("shortcut handler", () => {
    it("joins the next upcoming meeting when pressed", async () => {
      const { shell } = await import("electron");
      registerShortcuts();

      // Get the handler function passed to globalShortcut.register
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      expect(shell.openExternal).toHaveBeenCalledWith(
        "https://meet.google.com/abc-def-ghi?authuser=user%40example.com",
      );
    });

    it("does nothing when no calendar events available", async () => {
      const { shell } = await import("electron");
      const { getCalendarEventsResult } =
        await import("../../src/main/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({ events: [] });

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      expect(shell.openExternal).not.toHaveBeenCalled();
    });

    it("does nothing when calendar returns error", async () => {
      const { shell } = await import("electron");
      const { getCalendarEventsResult } =
        await import("../../src/main/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        error: "no access",
      });

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      expect(shell.openExternal).not.toHaveBeenCalled();
    });

  describe("registration failure", () => {
    it("does not mark as registered when globalShortcut.register returns false", async () => {
      const electron = await import("electron");
      vi.mocked(electron.globalShortcut.register).mockReturnValue(false);

      registerShortcuts();

      // Should have attempted to register
      expect(electron.globalShortcut.register).toHaveBeenCalledTimes(1);

      // Calling again should try again since it was not marked as registered
      registerShortcuts();
      expect(electron.globalShortcut.register).toHaveBeenCalledTimes(2);
    });
  });


  describe("shortcut handler — edge cases", () => {
    it("filters out all-day events", async () => {
      const { shell } = await import("electron");
      const { getCalendarEventsResult } =
        await import("../../src/main/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        events: [
          {
            id: "evt-allday",
            title: "All Day Event",
            startDate: new Date(Date.now() + 3600000).toISOString(),
            endDate: new Date(Date.now() + 86400000).toISOString(),
            meetUrl: "https://meet.google.com/xxx-yyy-zzz",
            calendarName: "Work",
            isAllDay: true,
            userEmail: "user@example.com",
          },
        ],
      });

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      expect(shell.openExternal).not.toHaveBeenCalled();
    });

    it("filters out events without meetUrl", async () => {
      const { shell } = await import("electron");
      const { getCalendarEventsResult } =
        await import("../../src/main/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        events: [
          {
            id: "evt-no-url",
            title: "No URL Meeting",
            startDate: new Date(Date.now() + 3600000).toISOString(),
            endDate: new Date(Date.now() + 7200000).toISOString(),
            meetUrl: "",
            calendarName: "Work",
            isAllDay: false,
            userEmail: "user@example.com",
          },
        ],
      });

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      expect(shell.openExternal).not.toHaveBeenCalled();
    });

    it("picks the earliest upcoming meeting when multiple exist", async () => {
      const { shell } = await import("electron");
      const { getCalendarEventsResult } =
        await import("../../src/main/calendar.js");
      const { buildMeetUrl } =
        await import("../../src/main/utils/meet-url.js");

      const earlyStart = new Date(Date.now() + 1800000).toISOString();
      const lateStart = new Date(Date.now() + 7200000).toISOString();

      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        events: [
          {
            id: "evt-late",
            title: "Late Meeting",
            startDate: lateStart,
            endDate: new Date(Date.now() + 10800000).toISOString(),
            meetUrl: "https://meet.google.com/late-mtg-url",
            calendarName: "Work",
            isAllDay: false,
            userEmail: "late@example.com",
          },
          {
            id: "evt-early",
            title: "Early Meeting",
            startDate: earlyStart,
            endDate: new Date(Date.now() + 3600000).toISOString(),
            meetUrl: "https://meet.google.com/early-mtg-url",
            calendarName: "Work",
            isAllDay: false,
            userEmail: "early@example.com",
          },
        ],
      });

      vi.mocked(buildMeetUrl).mockReturnValueOnce(
        "https://meet.google.com/early-mtg-url?authuser=early%40example.com",
      );

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      // buildMeetUrl should have been called with the earlier meeting
      expect(vi.mocked(buildMeetUrl).mock.calls[0][0]).toMatchObject({
        id: "evt-early",
      });
      expect(shell.openExternal).toHaveBeenCalledWith(
        "https://meet.google.com/early-mtg-url?authuser=early%40example.com",
      );
    });

    it("does nothing when buildMeetUrl returns null", async () => {
      const { shell } = await import("electron");
      const { buildMeetUrl } =
        await import("../../src/main/utils/meet-url.js");
      vi.mocked(buildMeetUrl).mockReturnValueOnce(null as never);

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      expect(shell.openExternal).not.toHaveBeenCalled();
    });

    it("handles errors from getCalendarEventsResult gracefully", async () => {
      const { shell } = await import("electron");
      const { getCalendarEventsResult } =
        await import("../../src/main/calendar.js");
      vi.mocked(getCalendarEventsResult).mockRejectedValueOnce(
        new Error("Calendar unavailable"),
      );

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];

      // Should not throw
      await expect(handler()).resolves.toBeUndefined();
      expect(shell.openExternal).not.toHaveBeenCalled();
    });

    it("filters out past events", async () => {
      const { shell } = await import("electron");
      const { getCalendarEventsResult } =
        await import("../../src/main/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        events: [
          {
            id: "evt-past",
            title: "Past Meeting",
            startDate: new Date(Date.now() - 3600000).toISOString(),
            endDate: new Date(Date.now() - 1800000).toISOString(),
            meetUrl: "https://meet.google.com/past-mtg-url",
            calendarName: "Work",
            isAllDay: false,
            userEmail: "user@example.com",
          },
        ],
      });

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      expect(shell.openExternal).not.toHaveBeenCalled();
    });
  });
  });
});
