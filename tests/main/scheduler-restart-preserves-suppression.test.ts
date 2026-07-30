import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/domain/entities/settings.js";
import { asTestEventId } from "../helpers/test-utils.js";

// Mock electron
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/test"),
    getAppPath: vi.fn().mockReturnValue("/tmp/test"),
  },
}));

// Mock calendar module so startScheduler's initial poll() resolves quickly
vi.mock("../../src/main/facades/calendar.js", () => ({
  reportCalendarPollError: vi.fn(),
  getCalendarEventsResult: vi.fn().mockResolvedValue({ kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] }),
}));

// Mock power module
vi.mock("../../src/main/system/power.js", () => ({
  getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000),
  preventSleep: vi.fn(),
  allowSleep: vi.fn(),
}));

// Mock settings
vi.mock("../../src/main/facades/settings.js", () => ({
  getSettings: vi.fn().mockReturnValue({
    schemaVersion: 3,
    openBeforeMinutes: 1,
    launchAtLogin: false,
    showTomorrowMeetings: true,
    showCompletedTodayMeetings: false,
    windowAlert: true,
    autoOpenEnabled: true,
    alertLeadSeconds: 60,
    nativeNotifications: true,
    lateJoinGraceMinutes: 0,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  }),
}));

describe("scheduler/facade.restartScheduler — suppression-state preservation (F2)", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves firedEvents across restartScheduler", async () => {
    const stateModule = await import("../../src/main/scheduler/state/index.js");
    const facade = await import("../../src/main/scheduler/facade.js");

    const id = asTestEventId("evt-fired-1");
    const expiresAt = Date.now() + 15 * 60 * 1000;
    stateModule.state.firedEvents.set(id, expiresAt);

    facade.restartScheduler();

    expect(stateModule.state.firedEvents.has(id)).toBe(true);
    expect(stateModule.state.firedEvents.get(id)).toBe(expiresAt);

    facade.stopScheduler();
  });

  it("preserves alertFiredEvents across restartScheduler", async () => {
    const stateModule = await import("../../src/main/scheduler/state/index.js");
    const facade = await import("../../src/main/scheduler/facade.js");

    const id = asTestEventId("evt-alert-fired-1");
    const expiresAt = Date.now() + 15 * 60 * 1000;
    stateModule.state.alertFiredEvents.set(id, expiresAt);

    facade.restartScheduler();

    expect(stateModule.state.alertFiredEvents.has(id)).toBe(true);
    expect(stateModule.state.alertFiredEvents.get(id)).toBe(expiresAt);

    facade.stopScheduler();
  });

  it("preserves cancelledEvents across restartScheduler", async () => {
    const stateModule = await import("../../src/main/scheduler/state/index.js");
    const facade = await import("../../src/main/scheduler/facade.js");

    const id = asTestEventId("evt-cancelled-1");
    stateModule.state.cancelledEvents.add(id);

    facade.restartScheduler();

    expect(stateModule.state.cancelledEvents.has(id)).toBe(true);

    facade.stopScheduler();
  });

  it("still clears timer handles on restartScheduler (suppression preservation does not leak timers)", async () => {
    const stateModule = await import("../../src/main/scheduler/state/index.js");
    const facade = await import("../../src/main/scheduler/facade.js");

    const id = asTestEventId("evt-timer-1");
    let fired = false;
    const handle = setTimeout(() => {
      fired = true;
    }, 60_000);
    stateModule.state.timers.set(id, handle);

    facade.restartScheduler();

    // Timer map cleared (handles removed) but suppression Maps untouched
    expect(stateModule.state.timers.has(id)).toBe(false);

    // Advancing time must not fire the original handle
    vi.advanceTimersByTime(120_000);
    expect(fired).toBe(false);

    facade.stopScheduler();
  });

  it("plain stopScheduler() (no opts) clears suppression Maps (default behavior unchanged)", async () => {
    const stateModule = await import("../../src/main/scheduler/state/index.js");
    const facade = await import("../../src/main/scheduler/facade.js");

    const firedId = asTestEventId("evt-default-fired");
    const alertId = asTestEventId("evt-default-alert");
    const cancelledId = asTestEventId("evt-default-cancelled");
    stateModule.state.firedEvents.set(firedId, Date.now() + 60_000);
    stateModule.state.alertFiredEvents.set(alertId, Date.now() + 60_000);
    stateModule.state.cancelledEvents.add(cancelledId);

    facade.stopScheduler();

    expect(stateModule.state.firedEvents.size).toBe(0);
    expect(stateModule.state.alertFiredEvents.size).toBe(0);
    expect(stateModule.state.cancelledEvents.size).toBe(0);
  });
});
