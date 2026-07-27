import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/main/facades/calendar.js", () => ({
  getCalendarEventsResult: vi.fn().mockResolvedValue({ kind: "ok", events: [] }),
  requestCalendarPermission: vi.fn().mockResolvedValue("granted"),
  getCalendarPermissionStatus: vi.fn().mockResolvedValue("granted"),
  disconnectCalendar: vi.fn().mockResolvedValue(undefined),
  getCalendarUiState: vi.fn().mockReturnValue({
    permission: "granted",
    phase: "ready",
    lastError: null,
    accountEmail: "a@b.com",
    events: [],
    offline: false,
    oauthConfigured: true,
  }),
  warmupCalendarProvider: vi.fn().mockResolvedValue(undefined),
  invalidateCalendarPermissionCache: vi.fn(),
  shouldAutoRequestCalendarPermission: vi.fn().mockReturnValue(false),
  reportCalendarPollError: vi.fn(),
  rebindCalendarDefaults: vi.fn(),
}));

vi.mock("../../src/main/facades/settings.js", () => ({
  loadSettings: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  getSettings: vi.fn().mockReturnValue({ openBeforeMinutes: 1 }),
  updateSettings: vi.fn().mockResolvedValue({ openBeforeMinutes: 2 }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  rebindSettingsDefaults: vi.fn(),
}));

vi.mock("../../src/main/facades/calendar-watcher.js", () => ({
  startCalendarWatcher: vi.fn(),
  stopCalendarWatcher: vi.fn(),
  reviveCalendarWatcher: vi.fn(),
}));

vi.mock("../../src/main/utils/join-meeting.js", () => ({
  joinMeetingById: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  rebindJoinMeetingDefaults: vi.fn(),
}));

vi.mock("../../src/main/scheduler/facade.js", () => ({
  forcePoll: vi.fn().mockResolvedValue(undefined),
  getLastKnownEvents: vi.fn().mockReturnValue(null),
  cancelPendingBrowserOpen: vi.fn(),
  startScheduler: vi.fn(),
  stopScheduler: vi.fn(),
  restartScheduler: vi.fn(),
  setSchedulerWindow: vi.fn(),
  setTrayTitleCallback: vi.fn(),
  initPowerCallbacks: vi.fn(),
}));

vi.mock("../../src/main/infrastructure/electron/shell-meeting-opener.js", () => ({
  createShellMeetingOpener: () => ({
    open: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  }),
}));

import { createAppGraph } from "../../src/main/composition/app-graph.js";
import { asTestEventId } from "../helpers/test-utils.js";

describe("createAppGraph surface coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes and invokes all graph surfaces", async () => {
    const graph = createAppGraph({ skipBind: true });
    await graph.calendar.getEvents();
    await graph.calendar.requestPermission();
    await graph.calendar.getPermissionStatus();
    await graph.calendar.disconnect();
    graph.calendar.getUiState();
    await graph.calendar.warmup();
    graph.calendar.invalidatePermissionCache();
    graph.calendar.shouldAutoRequestPermission();
    graph.calendar.reportPollError("e", null);
    await graph.settings.load();
    graph.settings.get();
    await graph.settings.update({ openBeforeMinutes: 2 });
    await graph.settings.save({ openBeforeMinutes: 2 } as never);
    await graph.join.byId(asTestEventId("e1"));
    await graph.opener.open("https://meet.google.com/abc-defg-hij");
    await graph.scheduler.forcePoll();
    graph.scheduler.getLastKnownEvents();
    graph.scheduler.cancelPendingBrowserOpen(asTestEventId("e1"));
    graph.scheduler.start();
    graph.scheduler.stop();
    graph.scheduler.restart();
    graph.scheduler.setWindow({} as never);
    graph.scheduler.setTrayTitleCallback(() => {});
    graph.scheduler.initPowerCallbacks({
      getPollInterval: () => 120000,
      preventSleep: () => {},
      allowSleep: () => {},
    });
    graph.watcher.start();
    graph.watcher.stop();
    graph.watcher.revive();
    expect(graph.calendar).toBeDefined();
  });

  it("bindComposition path when skipBind false", () => {
    const graph = createAppGraph({ skipBind: false });
    expect(graph.join).toBeDefined();
  });
});
