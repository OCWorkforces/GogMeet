import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock electron
vi.mock("electron", () => ({
  app: { getPath: vi.fn().mockReturnValue("/tmp/test") },
}));

// Mock calendar module — single source of truth for poll() side effect counting
vi.mock("../../src/main/domain/calendar.js", () => ({
  getCalendarEventsResult: vi.fn().mockResolvedValue({ kind: "ok", events: [] }),
}));

// Mock power module
vi.mock("../../src/main/system/power.js", () => ({
  getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000),
  preventSleep: vi.fn(),
  allowSleep: vi.fn(),
}));

// Mock settings
vi.mock("../../src/main/domain/settings.js", () => ({
  getSettings: vi
    .fn()
    .mockReturnValue({ openBeforeMinutes: 1, windowAlert: true }),
}));

const { getCalendarEventsResult } = await import("../../src/main/domain/calendar.js");
const stateModule = await import("../../src/main/scheduler/state/index.js");
const {
  initPowerCallbacks,
  forcePoll,
  stopScheduler,
  _resetForceTestState,
} = await import("../../src/main/scheduler/facade.js");
const { _resetForTest } = await import("../../src/main/scheduler/poll.js");

const FORCE_POLL_COALESCE_MS = 10_000;

describe("forcePoll() deferred coalesce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
    _resetForceTestState();
    vi.mocked(getCalendarEventsResult).mockClear();
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });
    initPowerCallbacks({
      getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000),
      preventSleep: vi.fn(),
      allowSleep: vi.fn(),
    });
  });

  afterEach(() => {
    _resetForTest();
    _resetForceTestState();
    vi.useRealTimers();
    stateModule.state.powerCallbacks = null;
  });

  it("schedules one deferred poll when called within coalesce window", async () => {
    // First forcePoll runs immediately
    await forcePoll();
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    // Stop the re-armed scheduled poll so it doesn't pollute the count
    if (stateModule.state.pollTimeout !== null) {
      clearTimeout(stateModule.state.pollTimeout);
      stateModule.state.pollTimeout = null;
    }

    // Subsequent calls within coalesce window should be deferred (not dropped)
    await forcePoll(); // schedules deferred
    await forcePoll(); // already scheduled — no-op
    await forcePoll(); // already scheduled — no-op

    // No additional poll yet
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    // Advance to the deferred poll firing time
    await vi.advanceTimersByTimeAsync(FORCE_POLL_COALESCE_MS);

    // Exactly one deferred poll should have fired
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(2);
  });

  it("stopScheduler clears any pending deferred forcePoll timer", async () => {
    await forcePoll();
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    if (stateModule.state.pollTimeout !== null) {
      clearTimeout(stateModule.state.pollTimeout);
      stateModule.state.pollTimeout = null;
    }

    // Schedule a deferred poll
    await forcePoll();
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    // Stop the scheduler — should clear the deferred timer
    stopScheduler();

    // Advance well past the coalesce window
    await vi.advanceTimersByTimeAsync(FORCE_POLL_COALESCE_MS * 2);

    // Deferred poll must NOT have fired after stopScheduler
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);
  });
});
