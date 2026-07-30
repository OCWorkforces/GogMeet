import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  globalShortcut: {
    register: vi.fn().mockReturnValue(true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
  app: {
    on: vi.fn(),
  },
  Notification: Object.assign(
    vi.fn().mockImplementation(() => ({ show: vi.fn() })),
    { isSupported: vi.fn().mockReturnValue(false) },
  ),
}));

vi.mock("electron-log", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../src/main/facades/calendar.js", () => ({
  getCalendarEventsResult: vi.fn().mockResolvedValue({
    kind: "ok",
      source: "live",
      completeness: "complete",
      observedAt: Date.now(),
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

vi.mock("../../src/main/scheduler/facade.js", () => ({
  getLastKnownEvents: vi.fn().mockReturnValue(null),
}));

vi.mock("../../src/main/utils/join-meeting.js", () => ({
  joinMeetingById: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}));

import { testAppGraph } from "../helpers/app-graph.js";
import { getCalendarEventsResult } from "../../src/main/facades/calendar.js";
import { getLastKnownEvents } from "../../src/main/scheduler/facade.js";
import { joinMeetingById } from "../../src/main/utils/join-meeting.js";

function shortcutsGraph() {
  return testAppGraph({
    calendar: {
      getEvents: () => getCalendarEventsResult(),
    },
    scheduler: {
      getLastKnownEvents: () => getLastKnownEvents(),
    },
    join: {
      byId: (id) => joinMeetingById(id),
    },
  });
}

describe("shortcuts", () => {
  let registerShortcuts: (graph: ReturnType<typeof shortcutsGraph>) => void;
  let pickJoinTarget: typeof import("../../src/domain/services/pick-join-target.js").pickJoinTarget;
  let globalShortcut: {
    register: ReturnType<typeof vi.fn>;
    unregisterAll: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const mod = await import("../../src/main/system/shortcuts.js");
    registerShortcuts = mod.registerShortcuts;
    pickJoinTarget = (await import("../../src/domain/services/pick-join-target.js")).pickJoinTarget;

    const electron = await import("electron");
    globalShortcut = electron.globalShortcut as unknown as typeof globalShortcut;
    vi.mocked(globalShortcut.register).mockReturnValue(true);
  });

  it("registers global shortcut on first call", () => {
    registerShortcuts(shortcutsGraph());
    expect(globalShortcut.register).toHaveBeenCalledWith(
      "CmdOrCtrl+Shift+M",
      expect.any(Function),
    );
  });

  it("does not register twice on subsequent calls", () => {
    registerShortcuts(shortcutsGraph());
    registerShortcuts(shortcutsGraph());
    expect(globalShortcut.register).toHaveBeenCalledTimes(1);
  });

  describe("pickJoinTarget", () => {
    it("prefers in-progress over future", () => {
      const now = Date.now();
      const inProgress = {
        id: "in",
        title: "Now",
        startDate: new Date(now - 60_000).toISOString(),
        endDate: new Date(now + 60_000).toISOString(),
        meetUrl: "https://meet.google.com/in-prog",
        calendarName: "Work",
        isAllDay: false,
      };
      const future = {
        id: "fut",
        title: "Later",
        startDate: new Date(now + 3600_000).toISOString(),
        endDate: new Date(now + 7200_000).toISOString(),
        meetUrl: "https://meet.google.com/future",
        calendarName: "Work",
        isAllDay: false,
      };
      expect(pickJoinTarget([future, inProgress] as never, now)?.id).toBe("in");
    });
  });

  describe("shortcut handler", () => {
    it("joins the target meeting by id", async () => {
      const { joinMeetingById } = await import("../../src/main/utils/join-meeting.js");
      registerShortcuts(shortcutsGraph());
      const handler = vi.mocked(globalShortcut.register).mock.calls[0]![1] as () => Promise<void>;
      await handler();
      expect(joinMeetingById).toHaveBeenCalledWith("evt-1");
    });

    it("does nothing when no calendar events available", async () => {
      const { joinMeetingById } = await import("../../src/main/utils/join-meeting.js");
      const { getCalendarEventsResult } = await import("../../src/main/facades/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({ kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] });

      registerShortcuts(shortcutsGraph());
      const handler = vi.mocked(globalShortcut.register).mock.calls[0]![1] as () => Promise<void>;
      await handler();
      expect(joinMeetingById).not.toHaveBeenCalled();
    });

    it("does nothing when calendar returns error", async () => {
      const { joinMeetingById } = await import("../../src/main/utils/join-meeting.js");
      const { getCalendarEventsResult } = await import("../../src/main/facades/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        kind: "err",
        error: "no access",
        code: "permission-denied",
      });

      registerShortcuts(shortcutsGraph());
      const handler = vi.mocked(globalShortcut.register).mock.calls[0]![1] as () => Promise<void>;
      await handler();
      expect(joinMeetingById).not.toHaveBeenCalled();
    });

    it("filters out all-day events", async () => {
      const { joinMeetingById } = await import("../../src/main/utils/join-meeting.js");
      const { getCalendarEventsResult } = await import("../../src/main/facades/calendar.js");
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        kind: "ok",
      source: "live",
      completeness: "complete",
      observedAt: Date.now(),
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

      registerShortcuts(shortcutsGraph());
      const handler = vi.mocked(globalShortcut.register).mock.calls[0]![1] as () => Promise<void>;
      await handler();
      expect(joinMeetingById).not.toHaveBeenCalled();
    });

    it("picks the earliest upcoming meeting when multiple exist", async () => {
      const { joinMeetingById } = await import("../../src/main/utils/join-meeting.js");
      const { getCalendarEventsResult } = await import("../../src/main/facades/calendar.js");
      const earlyStart = new Date(Date.now() + 1800000).toISOString();
      const lateStart = new Date(Date.now() + 7200000).toISOString();

      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        kind: "ok",
      source: "live",
      completeness: "complete",
      observedAt: Date.now(),
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

      registerShortcuts(shortcutsGraph());
      const handler = vi.mocked(globalShortcut.register).mock.calls[0]![1] as () => Promise<void>;
      await handler();
      expect(joinMeetingById).toHaveBeenCalledWith("evt-early");
    });

    it("joins in-progress meeting over future", async () => {
      const { joinMeetingById } = await import("../../src/main/utils/join-meeting.js");
      const { getCalendarEventsResult } = await import("../../src/main/facades/calendar.js");
      const now = Date.now();
      vi.mocked(getCalendarEventsResult).mockResolvedValueOnce({
        kind: "ok",
      source: "live",
      completeness: "complete",
      observedAt: Date.now(),
        events: [
          {
            id: "evt-future",
            title: "Future",
            startDate: new Date(now + 3600000).toISOString(),
            endDate: new Date(now + 7200000).toISOString(),
            meetUrl: "https://meet.google.com/future-mtg-url",
            calendarName: "Work",
            isAllDay: false,
            userEmail: "future@example.com",
          },
          {
            id: "evt-now",
            title: "In progress",
            startDate: new Date(now - 300000).toISOString(),
            endDate: new Date(now + 1800000).toISOString(),
            meetUrl: "https://meet.google.com/now-mtg-url",
            calendarName: "Work",
            isAllDay: false,
            userEmail: "now@example.com",
          },
        ],
      });

      registerShortcuts(shortcutsGraph());
      const handler = vi.mocked(globalShortcut.register).mock.calls[0]![1] as () => Promise<void>;
      await handler();
      expect(joinMeetingById).toHaveBeenCalledWith("evt-now");
    });
  });

  describe("registration failure", () => {
    it("does not mark as registered when globalShortcut.register returns false", async () => {
      const electron = await import("electron");
      vi.mocked(electron.globalShortcut.register).mockReturnValue(false);

      registerShortcuts(shortcutsGraph());
      expect(electron.globalShortcut.register).toHaveBeenCalledTimes(1);
      registerShortcuts(shortcutsGraph());
      expect(electron.globalShortcut.register).toHaveBeenCalledTimes(2);
    });
  });
});
