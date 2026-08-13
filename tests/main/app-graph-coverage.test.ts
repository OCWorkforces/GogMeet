import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getCalendarEventsResult,
  refreshCalendarPublication,
  requestCalendarPermission,
  getCalendarPermissionStatus,
  disconnectCalendar,
  getCalendarUiState,
  warmupCalendarProvider,
  invalidateCalendarPermissionCache,
  shouldAutoRequestCalendarPermission,
  reportCalendarPollError,
  rebindCalendarDefaults,
  loadSettings,
  getSettings,
  updateSettings,
  saveSettings,
  rebindSettingsDefaults,
  startCalendarWatcher,
  stopCalendarWatcher,
  reviveCalendarWatcher,
  joinMeetingById,
  rebindJoinMeetingDefaults,
  forcePoll,
  getLastKnownEvents,
  cancelPendingBrowserOpen,
  startScheduler,
  stopScheduler,
  restartScheduler,
  setSchedulerWindow,
  setTrayTitleCallback,
  initPowerCallbacks,
  openMock,
} = vi.hoisted(() => ({
  getCalendarEventsResult: vi.fn().mockResolvedValue({ kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] }),
  refreshCalendarPublication: vi.fn().mockResolvedValue({
    publicationGeneration: 1,
    result: { kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] },
  }),
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
  loadSettings: vi.fn().mockResolvedValue({ ok: true, value: { openBeforeMinutes: 1 } }),
  getSettings: vi.fn().mockReturnValue({ openBeforeMinutes: 1 }),
  updateSettings: vi.fn().mockResolvedValue({ openBeforeMinutes: 2 }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  rebindSettingsDefaults: vi.fn(),
  startCalendarWatcher: vi.fn(),
  stopCalendarWatcher: vi.fn(),
  reviveCalendarWatcher: vi.fn(),
  joinMeetingById: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  rebindJoinMeetingDefaults: vi.fn(),
  forcePoll: vi.fn().mockResolvedValue(undefined),
  getLastKnownEvents: vi.fn().mockReturnValue(null),
  cancelPendingBrowserOpen: vi.fn(),
  startScheduler: vi.fn(),
  stopScheduler: vi.fn(),
  restartScheduler: vi.fn(),
  setSchedulerWindow: vi.fn(),
  setTrayTitleCallback: vi.fn(),
  initPowerCallbacks: vi.fn(),
  openMock: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}));

vi.mock("../../src/main/facades/calendar.js", () => ({
  getCalendarEventsResult,
  refreshCalendarPublication,
  requestCalendarPermission,
  getCalendarPermissionStatus,
  disconnectCalendar,
  getCalendarUiState,
  warmupCalendarProvider,
  invalidateCalendarPermissionCache,
  shouldAutoRequestCalendarPermission,
  reportCalendarPollError,
  rebindCalendarDefaults,
}));

vi.mock("../../src/main/facades/settings.js", () => ({
  loadSettings,
  getSettings,
  updateSettings,
  saveSettings,
  rebindSettingsDefaults,
}));

vi.mock("../../src/main/facades/calendar-watcher.js", () => ({
  startCalendarWatcher,
  stopCalendarWatcher,
  reviveCalendarWatcher,
}));

vi.mock("../../src/main/utils/join-meeting.js", () => ({
  joinMeetingById,
  rebindJoinMeetingDefaults,
}));

vi.mock("../../src/main/scheduler/facade.js", () => ({
  forcePoll,
  getLastKnownEvents,
  cancelPendingBrowserOpen,
  startScheduler,
  stopScheduler,
  restartScheduler,
  setSchedulerWindow,
  setTrayTitleCallback,
  initPowerCallbacks,
}));

vi.mock("../../src/main/infrastructure/electron/shell-meeting-opener.js", () => ({
  createShellMeetingOpener: () => ({ open: openMock }),
}));

import { createAppGraph } from "../../src/main/composition/app-graph.js";
import { asTestEventId } from "../helpers/test-utils.js";

describe("createAppGraph surface coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes and invokes all graph surfaces with real return values", async () => {
    const graph = createAppGraph({ skipBind: true });
    expect(await graph.calendar.getEvents()).toMatchObject({
      publicationGeneration: 1,
      result: { kind: "ok", source: "live", completeness: "complete", events: [] },
    });
    expect(await graph.calendar.getEventsResult()).toEqual({
      kind: "ok",
      source: "live",
      completeness: "complete",
      observedAt: expect.any(Number),
      events: [],
    });
    expect(await graph.calendar.requestPermission()).toBe("granted");
    expect(await graph.calendar.getPermissionStatus()).toBe("granted");
    await graph.calendar.disconnect();
    expect(disconnectCalendar).toHaveBeenCalledOnce();
    expect(graph.calendar.getUiState().phase).toBe("ready");
    await graph.calendar.warmup();
    expect(warmupCalendarProvider).toHaveBeenCalledOnce();
    graph.calendar.invalidatePermissionCache();
    expect(invalidateCalendarPermissionCache).toHaveBeenCalledOnce();
    expect(graph.calendar.shouldAutoRequestPermission()).toBe(false);
    graph.calendar.reportPollError("e", null);
    expect(reportCalendarPollError).toHaveBeenCalledWith("e", null);

    expect(await graph.settings.load()).toEqual({ ok: true, value: { openBeforeMinutes: 1 } });
    expect(graph.settings.get()).toEqual({ openBeforeMinutes: 1 });
    expect(await graph.settings.update({ openBeforeMinutes: 2 })).toEqual({ openBeforeMinutes: 2 });
    await graph.settings.save({ openBeforeMinutes: 2 } as never);
    expect(saveSettings).toHaveBeenCalled();

    const id = asTestEventId("e1");
    expect(await graph.join.byId(id)).toEqual({ ok: true, value: undefined });
    expect(joinMeetingById).toHaveBeenCalledWith(id);
    expect(await graph.opener.open("https://meet.google.com/abc-defg-hij")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(openMock).toHaveBeenCalled();

    await graph.scheduler.forcePoll();
    expect(forcePoll).toHaveBeenCalledOnce();
    expect(graph.scheduler.getLastKnownEvents()).toBeNull();
    graph.scheduler.cancelPendingBrowserOpen(id);
    expect(cancelPendingBrowserOpen).toHaveBeenCalledWith(id);
    graph.scheduler.start();
    graph.scheduler.stop();
    graph.scheduler.restart();
    expect(startScheduler).toHaveBeenCalledOnce();
    expect(stopScheduler).toHaveBeenCalledOnce();
    expect(restartScheduler).toHaveBeenCalledOnce();
    const win = {} as never;
    graph.scheduler.setWindow(win);
    expect(setSchedulerWindow).toHaveBeenCalledWith(win);
    const cb = () => {};
    graph.scheduler.setTrayTitleCallback(cb);
    expect(setTrayTitleCallback).toHaveBeenCalledWith(cb);
    const power = {
      getPollInterval: () => 120000,
      preventSleep: () => {},
      allowSleep: () => {},
    };
    graph.scheduler.initPowerCallbacks(power);
    expect(initPowerCallbacks).toHaveBeenCalledWith(power);

    graph.watcher.start();
    graph.watcher.stop();
    graph.watcher.revive();
    expect(startCalendarWatcher).toHaveBeenCalledOnce();
    expect(stopCalendarWatcher).toHaveBeenCalledOnce();
    expect(reviveCalendarWatcher).toHaveBeenCalledOnce();
  });

  it("skipBind false rebinds free-function defaults", () => {
    createAppGraph({ skipBind: false });
    expect(rebindCalendarDefaults).toHaveBeenCalledOnce();
    expect(rebindSettingsDefaults).toHaveBeenCalledOnce();
    // bindComposition + post-opener rebind after single egress instance is installed
    expect(rebindJoinMeetingDefaults).toHaveBeenCalledTimes(2);
  });
});
