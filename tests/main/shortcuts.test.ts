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

  it("registers will-quit handler to unregister shortcut", () => {
    registerShortcuts();
    expect(app.on).toHaveBeenCalledWith("will-quit", expect.any(Function));
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
  });
});
