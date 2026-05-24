import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MeetingEvent } from "../../src/shared/meeting-event.js";
import { createMockEvent, asTestEventId, asTestIsoUtc, asTestMeetUrl, isoFromNow } from "../helpers/test-utils.js";

// Mock electron
vi.mock("electron", () => ({
  app: { getPath: vi.fn().mockReturnValue("/tmp/test") },
}));

// Mock calendar module
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

// Use stateModule.state to always get the current state reference after replaceState
const stateModule = await import("../../src/main/scheduler/state/index.js");
const { initPowerCallbacks, startScheduler, stopScheduler, restartScheduler } = await import(
  "../../src/main/scheduler/facade.js",
);

const { poll, _resetForTest } = await import("../../src/main/scheduler/poll.js");

// Live references to current state Maps — re-bound in each beforeEach after _resetForTest()
const { getCountdownIntervals, getClearTimers, getInMeetingIntervals, getInMeetingEndTimers } = stateModule;
let countdownIntervals = getCountdownIntervals();
let clearTimers = getClearTimers();
let inMeetingIntervals = getInMeetingIntervals();
let inMeetingEndTimers = getInMeetingEndTimers();
function refreshStateRefs(): void {
  countdownIntervals = getCountdownIntervals();
  clearTimers = getClearTimers();
  inMeetingIntervals = getInMeetingIntervals();
  inMeetingEndTimers = getInMeetingEndTimers();
}

function makeEvent(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  return createMockEvent(overrides);
}

const mockTrayCallback = vi.fn();

describe("poll()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
    refreshStateRefs();
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });
    stateModule.state.onTrayTitleUpdate = mockTrayCallback;
    mockTrayCallback.mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });
  });

  afterEach(() => {
    _resetForTest();
    refreshStateRefs();
    vi.useRealTimers();
    stateModule.state.powerCallbacks = null;
  });

  it("resets consecutiveErrors to 0 on successful poll with events", async () => {
    stateModule.setConsecutiveErrors(2);
    const event = makeEvent();
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [event] });

    await poll();

    expect(stateModule.getConsecutiveErrors()).toBe(0);
  });

  it("resets consecutiveErrors to 0 on success with empty events", async () => {
    stateModule.setConsecutiveErrors(1);
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });

    await poll();

    expect(stateModule.getConsecutiveErrors()).toBe(0);
  });

  it("increments consecutiveErrors on error result", async () => {
    vi.mocked(getCalendarEventsResult).mockResolvedValue({
      error: "Calendar access denied",
    } as never);

    await poll();
    expect(stateModule.getConsecutiveErrors()).toBe(1);

    await poll();
    expect(stateModule.getConsecutiveErrors()).toBe(2);
  });

  it("increments consecutiveErrors on thrown exception", async () => {
    vi.mocked(getCalendarEventsResult).mockRejectedValue(
      new Error("Network failure"),
    );

    await poll();
    expect(stateModule.getConsecutiveErrors()).toBe(1);
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
    expect(stateModule.getConsecutiveErrors()).toBe(1);
    expect(countdownIntervals.size).toBe(1);

    await poll();
    expect(stateModule.getConsecutiveErrors()).toBe(2);
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

    expect(stateModule.getConsecutiveErrors()).toBe(3);
    expect(countdownIntervals.size).toBe(0);
    expect(clearTimers.size).toBe(0);
    expect(inMeetingIntervals.size).toBe(0);
    expect(inMeetingEndTimers.size).toBe(0);
  });

  it("fires threshold cleanup exactly once across consecutive errors past MAX (one-shot)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getCalendarEventsResult).mockResolvedValue({
      error: "permission denied",
    } as never);

    await poll();
    await poll();
    await poll(); // crosses threshold — cleanup fires
    await poll(); // already past threshold — must NOT re-fire
    await poll();

    const thresholdLogs = errSpy.mock.calls.filter(([msg]) =>
      typeof msg === "string" && msg.includes("consecutive errors \u2014 cleared tray title"),
    );
    expect(thresholdLogs).toHaveLength(1);
    errSpy.mockRestore();
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
    expect(stateModule.getConsecutiveErrors()).toBe(2);

    await poll();
    expect(stateModule.getConsecutiveErrors()).toBe(3);
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
    // IPC now sends events array (empty in this case) instead of undefined
    expect(mockSend).toHaveBeenCalledWith("calendar:events-updated", []);

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

describe("event list signature gating (renderer push)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
    refreshStateRefs();
    stateModule.state.onTrayTitleUpdate = mockTrayCallback;
    mockTrayCallback.mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });
  });

  afterEach(() => {
    _resetForTest();
    refreshStateRefs();
    vi.useRealTimers();
    stateModule.state.powerCallbacks = null;
  });

  async function pushAndCount(events: MeetingEvent[]): Promise<number> {
    const mockSend = vi.fn();
    stateModule.state.win = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: { send: mockSend, isDestroyed: vi.fn().mockReturnValue(false) },
    } as never;
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events });
    await poll();
    return mockSend.mock.calls.length;
  }

  const baseFields = {
    title: "Standup",
    startDate: asTestIsoUtc(isoFromNow(5)),
    endDate: asTestIsoUtc(isoFromNow(35)),
    calendarName: "Work",
    isAllDay: false,
    userEmail: "a@example.com",
    description: "Notes A",
    meetUrl: asTestMeetUrl("https://meet.google.com/aaa-bbbb-ccc"),
  } satisfies Partial<MeetingEvent>;

  const overrides: Array<[string, Partial<MeetingEvent>]> = [
    ["meetUrl", { meetUrl: asTestMeetUrl("https://meet.google.com/zzz-yyyy-xxx") }],
    ["userEmail", { userEmail: "b@example.com" }],
    ["isAllDay", { isAllDay: true }],
    ["calendarName", { calendarName: "Personal" }],
  ];

  it.each(overrides)("re-pushes events when %s changes", async (_field, override) => {
    const evt1 = createMockEvent(baseFields);
    // First poll establishes baseline hash (returns 1 send on its own mock)
    let count = await pushAndCount([evt1]);
    expect(count).toBe(1);

    // Second poll, different field — must trigger another send (1 on the new mock)
    const evt2 = createMockEvent({ ...baseFields, ...override });
    count = await pushAndCount([evt2]);
    expect(count).toBe(1);
  });

  it("does NOT re-push when no relevant fields change", async () => {
    const evt = createMockEvent(baseFields);
    let count = await pushAndCount([evt]);
    expect(count).toBe(1);
    // Identical event — signature unchanged, no extra send on the new mock
    count = await pushAndCount([createMockEvent(baseFields)]);
    expect(count).toBe(0);
  });

  it("does NOT re-push when only description changes", async () => {
    // description is excluded from the signature: notes churn often and
    // never affects tray-list rendering.
    let count = await pushAndCount([createMockEvent(baseFields)]);
    expect(count).toBe(1);
    count = await pushAndCount([
      createMockEvent({ ...baseFields, description: "Different notes" }),
    ]);
    expect(count).toBe(0);
  });

  it("does NOT re-push when only event order changes", async () => {
    const evtA = createMockEvent({
      ...baseFields,
      id: asTestEventId("evt-a"),
      title: "A",
    });
    const evtB = createMockEvent({
      ...baseFields,
      id: asTestEventId("evt-b"),
      title: "B",
    });
    let count = await pushAndCount([evtA, evtB]);
    expect(count).toBe(1);
    // Same set, reordered — signature is order-independent
    count = await pushAndCount([evtB, evtA]);
    expect(count).toBe(0);
  });
});

describe("startScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
    refreshStateRefs();
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });
    stateModule.state.onTrayTitleUpdate = mockTrayCallback;
    mockTrayCallback.mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });
  });

  afterEach(() => {
    _resetForTest();
    refreshStateRefs();
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
    refreshStateRefs();
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });
    stateModule.state.onTrayTitleUpdate = mockTrayCallback;
    mockTrayCallback.mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });
  });

  afterEach(() => {
    _resetForTest();
    refreshStateRefs();
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
    refreshStateRefs();
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });
    stateModule.state.onTrayTitleUpdate = mockTrayCallback;
    mockTrayCallback.mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });
  });

  afterEach(() => {
    _resetForTest();
    refreshStateRefs();
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

    expect(stateModule.getConsecutiveErrors()).toBe(0);
  });

  it("resets activeTitleEventId to null", () => {
    stateModule.setActiveTitleEventId("some-id");

    _resetForTest();

    expect(stateModule.getActiveTitleEventId()).toBeNull();
  });

  it("resets activeInMeetingEventId to null", () => {
    stateModule.setActiveInMeetingEventId("other-id");

    _resetForTest();

    expect(stateModule.getActiveInMeetingEventId()).toBeNull();
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
    refreshStateRefs();

    expect(countdownIntervals.size).toBe(0);
  });
});
