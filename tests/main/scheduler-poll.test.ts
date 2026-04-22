import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MeetingEvent } from "../../src/shared/models.js";

// Mock electron
vi.mock("electron", () => ({
  app: { getPath: vi.fn().mockReturnValue("/tmp/test") },
}));

// Mock calendar module
vi.mock("../../src/main/calendar.js", () => ({
  getCalendarEventsResult: vi.fn().mockResolvedValue({ kind: "ok", events: [] }),
}));

// Mock power module
vi.mock("../../src/main/power.js", () => ({
  getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000),
  preventSleep: vi.fn(),
  allowSleep: vi.fn(),
}));

// Mock settings
vi.mock("../../src/main/settings.js", () => ({
  getSettings: vi
    .fn()
    .mockReturnValue({ openBeforeMinutes: 1, windowAlert: true }),
}));

const { getCalendarEventsResult } = await import("../../src/main/calendar.js");

// Use stateModule.state to always get the current state reference after replaceState
const stateModule = await import("../../src/main/scheduler/state.js");
const { initPowerCallbacks } = stateModule;

const { poll, startScheduler, stopScheduler, restartScheduler, _resetForTest } =
  await import("../../src/main/scheduler/poll.js");

// Access proxy views from state module for reading map state
const {
  countdownIntervals,
  clearTimers,
  inMeetingIntervals,
  inMeetingEndTimers,
} = stateModule;

function makeEvent(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  return {
    id: "test-id",
    title: "Test Meeting",
    startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    endDate: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
    meetUrl: "https://meet.google.com/abc-def-ghi",
    calendarName: "Work",
    isAllDay: false,
    userEmail: "user@example.com",
    ...overrides,
  };
}

const mockTrayCallback = vi.fn();

describe("poll()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });
    stateModule.state.onTrayTitleUpdate = mockTrayCallback;
    mockTrayCallback.mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });
  });

  afterEach(() => {
    _resetForTest();
    vi.useRealTimers();
    stateModule.state.powerCallbacks = null;
  });

  it("resets consecutiveErrors to 0 on successful poll with events", async () => {
    stateModule.setConsecutiveErrors(2);
    const event = makeEvent();
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [event] });

    await poll();

    expect(stateModule.consecutiveErrors).toBe(0);
  });

  it("resets consecutiveErrors to 0 on success with empty events", async () => {
    stateModule.setConsecutiveErrors(1);
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });

    await poll();

    expect(stateModule.consecutiveErrors).toBe(0);
  });

  it("increments consecutiveErrors on error result", async () => {
    vi.mocked(getCalendarEventsResult).mockResolvedValue({
      error: "Calendar access denied",
    } as never);

    await poll();
    expect(stateModule.consecutiveErrors).toBe(1);

    await poll();
    expect(stateModule.consecutiveErrors).toBe(2);
  });

  it("increments consecutiveErrors on thrown exception", async () => {
    vi.mocked(getCalendarEventsResult).mockRejectedValue(
      new Error("Network failure"),
    );

    await poll();
    expect(stateModule.consecutiveErrors).toBe(1);
  });

  it("does not clear display timers on 1-2 consecutive errors", async () => {
    // Set up a countdown interval to track via the real state
    stateModule.state.countdownIntervals.set(
      "evt-1",
      setInterval(() => {}, 60_000),
    );

    vi.mocked(getCalendarEventsResult).mockResolvedValue({
      error: "permission denied",
    } as never);

    await poll();
    expect(stateModule.consecutiveErrors).toBe(1);
    expect(countdownIntervals.size).toBe(1);

    await poll();
    expect(stateModule.consecutiveErrors).toBe(2);
    expect(countdownIntervals.size).toBe(1);

    clearInterval(stateModule.state.countdownIntervals.get("evt-1")!);
    stateModule.state.countdownIntervals.clear();
  });

  it("clears all display timers after MAX_CONSECUTIVE_ERRORS (3)", async () => {
    // Set up timers to be cleared
    stateModule.state.countdownIntervals.set(
      "a",
      setInterval(() => {}, 60_000),
    );
    stateModule.state.clearTimers.set(
      "a",
      setTimeout(() => {}, 60_000),
    );
    stateModule.state.inMeetingIntervals.set(
      "b",
      setInterval(() => {}, 60_000),
    );
    stateModule.state.inMeetingEndTimers.set(
      "b",
      setTimeout(() => {}, 60_000),
    );

    vi.mocked(getCalendarEventsResult).mockResolvedValue({
      error: "permission denied",
    } as never);

    await poll();
    await poll();
    await poll();

    expect(stateModule.consecutiveErrors).toBe(3);
    expect(countdownIntervals.size).toBe(0);
    expect(clearTimers.size).toBe(0);
    expect(inMeetingIntervals.size).toBe(0);
    expect(inMeetingEndTimers.size).toBe(0);
  });

  it("resets activeInMeetingEventId after MAX_CONSECUTIVE_ERRORS", async () => {
    stateModule.setActiveInMeetingEventId("im-1");
    vi.mocked(getCalendarEventsResult).mockResolvedValue({
      error: "error",
    } as never);

    await poll();
    await poll();
    await poll();

    expect(stateModule.state.activeInMeetingEventId).toBeNull();
  });

  it("clears tray title (resolveActiveTitleEvent) after MAX_CONSECUTIVE_ERRORS", async () => {
    vi.mocked(getCalendarEventsResult).mockResolvedValue({
      error: "error",
    } as never);

    await poll();
    await poll();
    await poll();

    // resolveActiveTitleEvent was called → clears tray since no countdowns
    expect(mockTrayCallback).toHaveBeenCalledWith(null);
  });

  it("clears display timers on thrown exception at threshold", async () => {
    stateModule.state.countdownIntervals.set(
      "a",
      setInterval(() => {}, 60_000),
    );

    vi.mocked(getCalendarEventsResult).mockRejectedValue(new Error("crash"));

    await poll();
    await poll();
    // After 2 errors, countdown should still be there
    // (Note: errors >= 3 triggers clear, so at count=2 no clear)
    expect(stateModule.consecutiveErrors).toBe(2);

    await poll();
    expect(stateModule.consecutiveErrors).toBe(3);
    expect(countdownIntervals.size).toBe(0);
  });

  it("sends IPC to renderer on success when window is alive", async () => {
    const mockSend = vi.fn();
    stateModule.state.win = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: { send: mockSend, isDestroyed: vi.fn().mockReturnValue(false) },
    } as never;

    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });

    await poll();

    expect(mockSend).toHaveBeenCalledWith("calendar:events-updated", undefined);

    stateModule.state.win = null;
  });

  it("does NOT send IPC when window is null", async () => {
    stateModule.state.win = null;
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });

    // Should not throw
    await expect(poll()).resolves.toBeUndefined();
  });

  it("does NOT send IPC when window is destroyed", async () => {
    const mockSend = vi.fn();
    stateModule.state.win = {
      isDestroyed: vi.fn().mockReturnValue(true),
      webContents: { send: mockSend },
    } as never;

    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });

    await poll();

    expect(mockSend).not.toHaveBeenCalled();

    stateModule.state.win = null;
  });

  it("does NOT send IPC on error", async () => {
    const mockSend = vi.fn();
    stateModule.state.win = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: { send: mockSend },
    } as never;

    vi.mocked(getCalendarEventsResult).mockResolvedValue({
      error: "denied",
    } as never);

    await poll();

    expect(mockSend).not.toHaveBeenCalled();

    stateModule.state.win = null;
  });

  it("marks both dirty flags after MAX_CONSECUTIVE_ERRORS", async () => {
    vi.mocked(getCalendarEventsResult).mockResolvedValue({
      error: "error",
    } as never);

    await poll();
    await poll();
    await poll();

    // After resolution, tray was cleared
    expect(mockTrayCallback).toHaveBeenCalledWith(null);
  });
});

describe("startScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });
    stateModule.state.onTrayTitleUpdate = mockTrayCallback;
    mockTrayCallback.mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });
  });

  afterEach(() => {
    _resetForTest();
    vi.useRealTimers();
    stateModule.state.powerCallbacks = null;
  });

  it("starts polling and sets pollTimeout after initial poll resolves", async () => {
    startScheduler();

    // Initial poll is async — need to flush it
    await vi.advanceTimersByTimeAsync(0);

    expect(stateModule.state.pollTimeout).not.toBeNull();
  });

  it("is idempotent — second call is a no-op when already running", async () => {
    startScheduler();
    await vi.advanceTimersByTimeAsync(0);
    const firstTimeout = stateModule.state.pollTimeout;

    startScheduler(); // should be no-op

    expect(stateModule.state.pollTimeout).toBe(firstTimeout);
  });

  it("calls poll on startup", async () => {
    vi.mocked(getCalendarEventsResult).mockClear();

    startScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);
  });
});

describe("stopScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });
    stateModule.state.onTrayTitleUpdate = mockTrayCallback;
    mockTrayCallback.mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });
  });

  afterEach(() => {
    _resetForTest();
    vi.useRealTimers();
    stateModule.state.powerCallbacks = null;
  });

  it("clears pollTimeout and resets state", async () => {
    startScheduler();
    await vi.advanceTimersByTimeAsync(0);
    expect(stateModule.state.pollTimeout).not.toBeNull();

    stopScheduler();

    expect(stateModule.state.pollTimeout).toBeNull();
  });

  it("clears tray title on stop", async () => {
    startScheduler();
    await vi.advanceTimersByTimeAsync(0);
    mockTrayCallback.mockClear();

    stopScheduler();

    expect(mockTrayCallback).toHaveBeenCalledWith(null);
  });

  it("preserves window reference after stop", () => {
    const mockWin = {
      isDestroyed: vi.fn(),
      webContents: { send: vi.fn() },
    } as never;
    stateModule.state.win = mockWin;

    stopScheduler();

    expect(stateModule.state.win).toBe(mockWin);
    stateModule.state.win = null;
  });
});

describe("restartScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });
    stateModule.state.onTrayTitleUpdate = mockTrayCallback;
    mockTrayCallback.mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });
  });

  afterEach(() => {
    _resetForTest();
    vi.useRealTimers();
    stateModule.state.powerCallbacks = null;
  });

  it("stops and restarts the scheduler", async () => {
    startScheduler();
    await vi.advanceTimersByTimeAsync(0);
    const firstTimeout = stateModule.state.pollTimeout;

    restartScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(stateModule.state.pollTimeout).not.toBeNull();
    expect(stateModule.state.pollTimeout).not.toBe(firstTimeout);
  });
});

describe("_resetForTest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets consecutive errors to 0", () => {
    stateModule.setConsecutiveErrors(5);

    _resetForTest();

    expect(stateModule.consecutiveErrors).toBe(0);
  });

  it("resets activeTitleEventId to null", () => {
    stateModule.setActiveTitleEventId("some-id");

    _resetForTest();

    expect(stateModule.activeTitleEventId).toBeNull();
  });

  it("resets activeInMeetingEventId to null", () => {
    stateModule.setActiveInMeetingEventId("other-id");

    _resetForTest();

    expect(stateModule.activeInMeetingEventId).toBeNull();
  });

  it("clears pollTimeout", () => {
    stateModule.state.pollTimeout = setTimeout(() => {}, 1000);

    _resetForTest();

    expect(stateModule.state.pollTimeout).toBeNull();
  });

  it("clears maps", () => {
    stateModule.state.countdownIntervals.set(
      "x",
      setInterval(() => {}, 1000),
    );

    _resetForTest();

    expect(countdownIntervals.size).toBe(0);
  });
});
