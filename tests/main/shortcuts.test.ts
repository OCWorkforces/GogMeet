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
  dialog: {
    showErrorBox: vi.fn(),
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
vi.mock("../../src/main/domain/calendar.js", () => ({
  getCalendarEventsResult: vi.fn().mockResolvedValue({
    kind: "ok",
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

// Mock scheduler facade
vi.mock("../../src/main/scheduler/facade.js", () => ({
  getLastKnownEvents: vi.fn().mockReturnValue(null),
}));

// Mock meet-url module — expose buildMeetUrl AND openMeetingUrl
vi.mock("../../src/main/utils/meet-url.js", () => ({
  buildMeetUrl: vi
    .fn()
    .mockReturnValue(
      "https://meet.google.com/abc-def-ghi?authuser=user%40example.com",
    ),
  openMeetingUrl: vi.fn().mockResolvedValue(undefined),
}));

describe("shortcuts", () => {
  let registerShortcuts: () => void;
  let globalShortcut: { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const mod = await import("../../src/main/system/shortcuts.js");
    registerShortcuts = mod.registerShortcuts;

    const electron = await import("electron");
    globalShortcut = electron.globalShortcut as unknown as typeof globalShortcut;
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
    it("routes the built meeting URL through openMeetingUrl when pressed", async () => {
      const { shell } = await import("electron");
      const { openMeetingUrl } = await import(
        "../../src/main/utils/meet-url.js"
      );
      registerShortcuts();

      // Get the handler function passed to globalShortcut.register
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      expect(openMeetingUrl).toHaveBeenCalledWith(
        "https://meet.google.com/abc-def-ghi?authuser=user%40example.com",
      );
      // The shortcut must NOT call shell.openExternal directly anymore
      expect(shell.openExternal).not.toHaveBeenCalled();
    });

    it("does nothing when no calendar events available", async () => {
      const { openMeetingUrl } = await import(
        "../../src/main/utils/meet-url.js"
      );
      const { getCalendarEventsResult } =
        await import("../../src/main/domain/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({ kind: "ok", events: [] });

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      expect(openMeetingUrl).not.toHaveBeenCalled();
    });

    it("does nothing when calendar returns error", async () => {
      const { openMeetingUrl } = await import(
        "../../src/main/utils/meet-url.js"
      );
      const { getCalendarEventsResult } =
        await import("../../src/main/domain/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        kind: "err",
        error: "no access",
      });

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      expect(openMeetingUrl).not.toHaveBeenCalled();
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
      const { openMeetingUrl } = await import(
        "../../src/main/utils/meet-url.js"
      );
      const { getCalendarEventsResult } =
        await import("../../src/main/domain/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        kind: "ok",
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

      expect(openMeetingUrl).not.toHaveBeenCalled();
    });

    it("filters out events without meetUrl", async () => {
      const { openMeetingUrl } = await import(
        "../../src/main/utils/meet-url.js"
      );
      const { getCalendarEventsResult } =
        await import("../../src/main/domain/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        kind: "ok",
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

      expect(openMeetingUrl).not.toHaveBeenCalled();
    });

    it("picks the earliest upcoming meeting when multiple exist", async () => {
      const { openMeetingUrl } = await import(
        "../../src/main/utils/meet-url.js"
      );
      const { getCalendarEventsResult } =
        await import("../../src/main/domain/calendar.js");
      const { buildMeetUrl } =
        await import("../../src/main/utils/meet-url.js");

      const earlyStart = new Date(Date.now() + 1800000).toISOString();
      const lateStart = new Date(Date.now() + 7200000).toISOString();

      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        kind: "ok",
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
      expect(openMeetingUrl).toHaveBeenCalledWith(
        "https://meet.google.com/early-mtg-url?authuser=early%40example.com",
      );
    });

    it("does nothing when buildMeetUrl returns empty string", async () => {
      const { openMeetingUrl, buildMeetUrl } = await import(
        "../../src/main/utils/meet-url.js"
      );
      vi.mocked(buildMeetUrl).mockReturnValueOnce("");

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];
      await handler();

      expect(openMeetingUrl).not.toHaveBeenCalled();
    });

    it("handles errors from getCalendarEventsResult gracefully", async () => {
      const { openMeetingUrl } = await import(
        "../../src/main/utils/meet-url.js"
      );
      const { getCalendarEventsResult } =
        await import("../../src/main/domain/calendar.js");
      vi.mocked(getCalendarEventsResult).mockRejectedValueOnce(
        new Error("Calendar unavailable"),
      );

      registerShortcuts();
      const handler = vi.mocked(globalShortcut.register).mock.calls[0][1];

      // Should not throw
      await expect(handler()).resolves.toBeUndefined();
      expect(openMeetingUrl).not.toHaveBeenCalled();
    });

    it("filters out past events", async () => {
      const { openMeetingUrl } = await import(
        "../../src/main/utils/meet-url.js"
      );
      const { getCalendarEventsResult } =
        await import("../../src/main/domain/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        kind: "ok",
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

      expect(openMeetingUrl).not.toHaveBeenCalled();
    });
  });
  });
});
