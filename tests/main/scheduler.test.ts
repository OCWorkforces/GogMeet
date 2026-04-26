import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MeetingEvent } from "../../src/shared/models.js";
import { createMockEvent } from "../helpers/test-utils.js";

// Mock electron before importing scheduler
vi.mock("electron", () => {
  function MockNotification(this: { show: ReturnType<typeof vi.fn> }) {
    this.show = vi.fn();
  }
  return {
    app: {
      getPath: vi.fn().mockReturnValue("/tmp/test-user-data"),
    },
    shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
    Notification: MockNotification,
  };
});

// Mock calendar module
vi.mock("../../src/main/calendar.js", () => ({
  getCalendarEventsResult: vi.fn().mockResolvedValue({ kind: "ok", events: [] }),
}));

// Mock tray module so updateTrayTitle can be spied on
vi.mock("../../src/main/tray.js", () => ({
  updateTrayTitle: vi.fn(),
}));

// Mock power module so scheduler uses a fixed poll interval
vi.mock("../../src/main/power.js", () => ({
  getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000),
  preventSleep: vi.fn(),
  allowSleep: vi.fn(),
}));

// Mock settings module — scheduler reads openBeforeMinutes via getSettings()
vi.mock("../../src/main/settings.js", () => ({
  getSettings: vi.fn().mockReturnValue({
    schemaVersion: 1,
    openBeforeMinutes: 3,
    launchAtLogin: false,
    showTomorrowMeetings: true,
    windowAlert: true,
  }),
  loadSettings: vi.fn().mockResolvedValue({ ok: true, value: {} }),
}));

const mockUpdateTrayTitle = vi.fn();
// Import directly from actual export locations (not re-exports)
const schedulerModule = await import("../../src/main/scheduler/index.js");
const { scheduleEvents, setSchedulerWindow, setTrayTitleCallback } = schedulerModule;
const pollModule = await import("../../src/main/scheduler/poll.js");
const { poll, _resetForTest } = pollModule;

const stateModule = await import("../../src/main/scheduler/state.js");
const { markTitleDirty, initPowerCallbacks, getTimers, getAlertTimers, getTitleTimers, getCountdownIntervals, getClearTimers, getInMeetingIntervals, getFiredEvents, getAlertFiredEvents, getScheduledEventData } = stateModule;
// Live references to current state Maps/Sets — re-bound in each beforeEach after _resetForTest()
let timers = getTimers();
let alertTimers = getAlertTimers();
let titleTimers = getTitleTimers();
let countdownIntervals = getCountdownIntervals();
let clearTimers = getClearTimers();
let inMeetingIntervals = getInMeetingIntervals();
let firedEvents = getFiredEvents();
let alertFiredEvents = getAlertFiredEvents();
let scheduledEventData = getScheduledEventData();
function refreshStateRefs(): void {
  timers = getTimers();
  alertTimers = getAlertTimers();
  titleTimers = getTitleTimers();
  countdownIntervals = getCountdownIntervals();
  clearTimers = getClearTimers();
  inMeetingIntervals = getInMeetingIntervals();
  firedEvents = getFiredEvents();
  alertFiredEvents = getAlertFiredEvents();
  scheduledEventData = getScheduledEventData();
}
const countdownModule = await import("../../src/main/scheduler/countdown.js");
const { resolveActiveTitleEvent, resolveActiveInMeetingEvent } = countdownModule;


// Inject mock tray callback into scheduler
setTrayTitleCallback(mockUpdateTrayTitle);

const { updateTrayTitle } = await import("../../src/main/tray.js");


const makeEvent = (overrides: Partial<MeetingEvent> = {}): MeetingEvent =>
  createMockEvent(overrides);

describe("scheduleEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    timers.clear();
    firedEvents.clear();
    scheduledEventData.clear();
    countdownIntervals.clear();
    _resetForTest();
    refreshStateRefs();
    vi.mocked(mockUpdateTrayTitle).mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });
  });
  afterEach(() => {
    vi.useRealTimers();
    timers.clear();
    firedEvents.clear();
    scheduledEventData.clear();
    countdownIntervals.clear();
    _resetForTest();
    refreshStateRefs();
    vi.mocked(mockUpdateTrayTitle).mockClear();
    stateModule.state.powerCallbacks = null;
  });
  it("rescheduled event gets a new timer at the new start time", () => {
    const originalStart = new Date(Date.now() + 5 * 60 * 1000);
    const newStart = new Date(Date.now() + 10 * 60 * 1000);

    const event = makeEvent({
      id: "A",
      startDate: originalStart.toISOString(),
    });
    scheduleEvents([event]);

    expect(timers.has("A")).toBe(true);
    expect(scheduledEventData.get("A")?.startMs).toBe(originalStart.getTime());
    // Reschedule to new time
    const rescheduled = makeEvent({
      id: "A",
      startDate: newStart.toISOString(),
    });
    scheduleEvents([rescheduled]);

    expect(timers.has("A")).toBe(true);
    expect(scheduledEventData.get("A")?.startMs).toBe(newStart.getTime());
    expect(firedEvents.has("A")).toBe(false);
  });

  it("firedEvents entries for removed events are pruned on each poll", () => {
    firedEvents.add("B");
    expect(firedEvents.has("B")).toBe(true);

    // Call with empty list — 'B' is no longer active
    scheduleEvents([]);

    expect(firedEvents.has("B")).toBe(false);
  });

  it("already-fired event at the same start time is not rescheduled", () => {
    const startDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "C", startDate });
    const startMs = new Date(startDate).getTime();

    // Mark as already fired
    firedEvents.add("C");
    scheduledEventData.set("C", {
      title: "Test Meeting",
      meetUrl: "https://meet.google.com/abc-def-ghi",
      startMs,
      endMs: startMs + 30 * 60 * 1000, // 30 min duration
    });
    scheduleEvents([event]);

    expect(timers.has("C")).toBe(false);
    expect(firedEvents.has("C")).toBe(true);
  });

  // ─── Group A: Active countdown event disappears ──────────────────────────

  it("A1: tray clears when the countdown event is deleted", () => {
    const event = makeEvent({
      id: "evt-a1",
      startDate: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    scheduleEvents([event]);
    expect(vi.mocked(mockUpdateTrayTitle)).toHaveBeenCalledWith("Test Meeting", expect.any(Number));
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Next poll — event deleted
    scheduleEvents([]);

    expect(vi.mocked(mockUpdateTrayTitle)).toHaveBeenCalledWith(null);
  });

  it("A5: second event is promoted when the earliest countdown event is deleted", () => {
    const first = makeEvent({ id: "first", title: "First Meeting", startDate: new Date(Date.now() + 8 * 60 * 1000).toISOString() });
    const second = makeEvent({ id: "second", title: "Second Meeting", startDate: new Date(Date.now() + 20 * 60 * 1000).toISOString() });
    scheduleEvents([first, second]);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Delete the first (earliest) — second should take over
    scheduleEvents([second]);

    const calls = vi.mocked(mockUpdateTrayTitle).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toBe("Second Meeting");
  });

  it("A6: tray is unchanged when the non-active second event is deleted", () => {
    const first = makeEvent({ id: "first", title: "First Meeting", startDate: new Date(Date.now() + 8 * 60 * 1000).toISOString() });
    const second = makeEvent({ id: "second", title: "Second Meeting", startDate: new Date(Date.now() + 20 * 60 * 1000).toISOString() });
    scheduleEvents([first, second]);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Delete second (non-owning) — first should still be shown
    scheduleEvents([first]);

    const calls = vi.mocked(mockUpdateTrayTitle).mock.calls;
    const calledWithNull = calls.some((c) => c[0] === null);
    expect(calledWithNull).toBe(false);
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toBe("First Meeting");
  });

  it("A7: tray clears when all countdown events are deleted simultaneously", () => {
    const e1 = makeEvent({ id: "e1", title: "Meeting 1", startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    const e2 = makeEvent({ id: "e2", title: "Meeting 2", startDate: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
    scheduleEvents([e1, e2]);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    scheduleEvents([]); // all gone

    expect(vi.mocked(mockUpdateTrayTitle)).toHaveBeenCalledWith(null);
  });

  // ─── Group D: Multiple concurrent countdowns ─────────────────────────────

  it("D14: earliest-starting event owns the tray — later event never overwrites", () => {
    const earlier = makeEvent({ id: "earlier", title: "Early Meeting", startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    const later = makeEvent({ id: "later", title: "Late Meeting", startDate: new Date(Date.now() + 20 * 60 * 1000).toISOString() });
    scheduleEvents([earlier, later]);

    // Advance 1 min to trigger per-minute ticks on both countdowns
    vi.advanceTimersByTime(60_000);

    const nonNullCalls = vi.mocked(mockUpdateTrayTitle).mock.calls.filter((c) => c[0] !== null);
    const lastContentCall = nonNullCalls[nonNullCalls.length - 1];
    expect(lastContentCall?.[0]).toBe("Early Meeting");
    const laterCalls = nonNullCalls.filter((c) => c[0] === "Late Meeting");
    expect(laterCalls).toHaveLength(0);
  });

  it("D15: a new closer event entering the window takes tray ownership", () => {
    const far = makeEvent({ id: "far", title: "Far Meeting", startDate: new Date(Date.now() + 25 * 60 * 1000).toISOString() });
    scheduleEvents([far]);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Second poll: closer event enters window alongside far
    const close = makeEvent({ id: "close", title: "Close Meeting", startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    scheduleEvents([far, close]);

    const calls = vi.mocked(mockUpdateTrayTitle).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toBe("Close Meeting");
  });

  // ─── Group B: Title/URL changes (same start time) ──────────────────────────

  it("B8: title change while in countdown updates tray immediately without rescheduling", () => {
    const startDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "b8", title: "Old Title", startDate });
    scheduleEvents([event]);
    const timerHandleBefore = timers.get("b8");
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Next poll — same event, same time, only title changed
    const renamed = makeEvent({ id: "b8", title: "New Title", startDate });
    scheduleEvents([renamed]);

    // Tray should update with new title
    expect(vi.mocked(mockUpdateTrayTitle)).toHaveBeenCalledWith("New Title", expect.any(Number));
    // Browser-open timer must NOT have been rescheduled
    expect(timers.get("b8")).toBe(timerHandleBefore);
    // scheduledEventData should reflect the new title
    expect(scheduledEventData.get("b8")?.title).toBe("New Title");
  });

  it("B9: URL change reschedules browser-open timer while keeping countdown", () => {
    const startDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "b9", title: "Meeting", meetUrl: "https://meet.google.com/old-url", startDate });
    scheduleEvents([event]);
    const timerHandleBefore = timers.get("b9");
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Next poll — same event, same time, only URL changed
    const urlChanged = makeEvent({ id: "b9", title: "Meeting", meetUrl: "https://meet.google.com/new-url", startDate });
    scheduleEvents([urlChanged]);

    // Browser-open timer MUST have been rescheduled (new handle)
    expect(timers.get("b9")).not.toBe(timerHandleBefore);
    expect(timers.has("b9")).toBe(true);
    // scheduledEventData should reflect the new URL
    expect(scheduledEventData.get("b9")?.meetUrl).toBe("https://meet.google.com/new-url");
  });

  it("B10: start time changed to past (in-progress) cleans up orphaned future timers", () => {
    const event = makeEvent({
      id: "b10",
      startDate: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      meetUrl: "https://meet.google.com/abc-def-ghi",
    });
    scheduleEvents([event]);
    expect(timers.has("b10")).toBe(true);
    expect(alertTimers.has("b10")).toBe(true);
    // Store the old timer handles
    const oldBrowserHandle = timers.get("b10");
    const oldAlertHandle = alertTimers.get("b10");
    // Advance 6 min — timers haven't fired yet (alert at 9min, browser at 10min with openBefore=1)
    vi.advanceTimersByTime(6 * 60_000);
    // Now reschedule the same event but with start time in the past (in-progress)
    const inProgressEvent = makeEvent({
      id: "b10",
      startDate: new Date(Date.now() - 3 * 60 * 1000).toISOString(), // 3 min ago
      endDate: new Date(Date.now() + 27 * 60 * 1000).toISOString(), // ends in 27 min
      meetUrl: "https://meet.google.com/abc-def-ghi",
    });
    scheduleEvents([inProgressEvent]);
    // Old timers should be cleaned up
    expect(timers.has("b10")).toBe(false);
    expect(alertTimers.has("b10")).toBe(false);
    expect(titleTimers.has("b10")).toBe(false);
    expect(countdownIntervals.has("b10")).toBe(false);
    expect(clearTimers.has("b10")).toBe(false);
    // In-meeting countdown should have started
    expect(inMeetingIntervals.has("b10")).toBe(true);
    // fired flag should be cleared
    expect(firedEvents.has("b10")).toBe(false);
  });

  it("B11: start time changed after browser-open fired reschedules new timer", () => {
    const event = makeEvent({
      id: "b11",
      startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      meetUrl: "https://meet.google.com/abc-def-ghi",
    });
    scheduleEvents([event]);
    // Advance past the timer fire time (openBefore=1min, so fires at 4min)
    vi.advanceTimersByTime(5 * 60_000 + 100);
    expect(firedEvents.has("b11")).toBe(true);
    // Reschedule with new start time 15 min from now
    const rescheduled = makeEvent({
      id: "b11",
      startDate: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      meetUrl: "https://meet.google.com/abc-def-ghi",
    });
    scheduleEvents([rescheduled]);
    // Should have a new timer and fired flag should be cleared
    expect(timers.has("b11")).toBe(true);
    expect(firedEvents.has("b11")).toBe(false);
    const newStartMs = new Date(Date.now() + 15 * 60_000).getTime();
    expect(scheduledEventData.get("b11")?.startMs).toBeCloseTo(newStartMs, -2);
  });

  it("B12: start time changed while alert pending reschedules both timers", () => {
    const event = makeEvent({
      id: "b12",
      startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      meetUrl: "https://meet.google.com/abc-def-ghi",
    });
    scheduleEvents([event]);
    // Store old timer handles
    const oldBrowserHandle = timers.get("b12");
    const oldAlertHandle = alertTimers.get("b12");
    expect(oldBrowserHandle).toBeDefined();
    expect(oldAlertHandle).toBeDefined();
    // Reschedule to 20 min from now
    const rescheduled = makeEvent({
      id: "b12",
      startDate: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      meetUrl: "https://meet.google.com/abc-def-ghi",
    });
    scheduleEvents([rescheduled]);
    // Both timers should be rescheduled with new handles
    expect(timers.get("b12")).not.toBe(oldBrowserHandle);
    expect(alertTimers.get("b12")).not.toBe(oldAlertHandle);
    const newStartMs = new Date(Date.now() + 20 * 60_000).getTime();
    expect(scheduledEventData.get("b12")?.startMs).toBeCloseTo(newStartMs, -2);
  });

  it("B13: fired event with unchanged start time is still skipped (regression guard)", () => {
    const startDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const event = makeEvent({
      id: "b13",
      startDate,
      meetUrl: "https://meet.google.com/abc-def-ghi",
    });
    scheduleEvents([event]);
    // Advance past the timer fire time
    vi.advanceTimersByTime(5 * 60_000 + 100);
    expect(firedEvents.has("b13")).toBe(true);
    // Call scheduleEvents with the SAME event (unchanged)
    scheduleEvents([event]);
    // No new timer should be created
    expect(timers.has("b13")).toBe(false);
    expect(firedEvents.has("b13")).toBe(true);
  });


  // ─── Group A continued: Rescheduled-time edge cases ───────────────────────

  it("A2: event rescheduled beyond 30-min window clears tray and schedules future title timer", () => {
    const inWindowStart = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "a2", startDate: inWindowStart });
    scheduleEvents([event]);
    expect(vi.mocked(mockUpdateTrayTitle)).toHaveBeenCalledWith("Test Meeting", expect.any(Number));
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Rescheduled to 45 min away (outside 30-min window)
    const rescheduled = makeEvent({ id: "a2", startDate: new Date(Date.now() + 45 * 60 * 1000).toISOString() });
    scheduleEvents([rescheduled]);

    // Tray must clear (no more active countdown)
    expect(vi.mocked(mockUpdateTrayTitle)).toHaveBeenCalledWith(null);
    // A future title timer must be set
    expect(timers.has("a2")).toBe(true); // browser open timer rescheduled
  });

  it("A3: event rescheduled closer restarts countdown with corrected remaining time", () => {
    const originalStart = new Date(Date.now() + 25 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "a3", startDate: originalStart });
    scheduleEvents([event]);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Rescheduled to 10 min away (still in window, but closer)
    const newStart = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const rescheduled = makeEvent({ id: "a3", startDate: newStart });
    scheduleEvents([rescheduled]);

    // Countdown must show ~10 mins remaining, not ~25
    const calls = vi.mocked(mockUpdateTrayTitle).mock.calls.filter((c) => c[0] !== null);
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toBeLessThanOrEqual(10);
    expect(lastCall?.[1]).toBeGreaterThan(0);
  });

  it("A4: event rescheduled to tomorrow clears tray and reschedules all timers", () => {
    const inWindowStart = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "a4", startDate: inWindowStart });
    scheduleEvents([event]);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Rescheduled to 23 hours away
    const tomorrow = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    const rescheduled = makeEvent({ id: "a4", startDate: tomorrow });
    scheduleEvents([rescheduled]);

    // Tray must clear
    expect(vi.mocked(mockUpdateTrayTitle)).toHaveBeenCalledWith(null);
    // Browser timer rescheduled for 23h out
    expect(timers.has("a4")).toBe(true);
    // scheduledEventData must reflect new start
    const newStartMs = new Date(tomorrow).getTime();
    expect(scheduledEventData.get("a4")?.startMs).toBe(newStartMs);
  });

  // ─── Group C: Race conditions ──────────────────────────────────────

  it("C10: startCountdown bails if event was deleted before titleTimer fired", () => {
    // Event starts in 35 min — outside the 30-min window, titleTimer set for 5 min from now
    const startDate = new Date(Date.now() + 35 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "c10", startDate });
    scheduleEvents([event]);
    // titleTimer is set but countdown not yet started
    expect(timers.has("c10")).toBe(true);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Event is deleted before the titleTimer fires
    scheduleEvents([]);

    // Now advance past the titleTimer fire time
    vi.advanceTimersByTime(6 * 60 * 1000);

    // startCountdown should have bailed — no countdown interval, no tray update with a title
    const calls = vi.mocked(mockUpdateTrayTitle).mock.calls;
    const titleCalls = calls.filter((c) => c[0] !== null);
    expect(titleCalls).toHaveLength(0);
  });

  it("C11: tray clear at meeting start is idempotent when event also disappears from poll", () => {
    const startDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "c11", startDate });
    scheduleEvents([event]);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Advance to meeting start — clearTimer fires, clearing the tray
    vi.advanceTimersByTime(5 * 60 * 1000 + 100);

    // Simultaneously, next poll returns no events (already started / deleted)
    scheduleEvents([]);

    // updateTrayTitle(null) may be called multiple times but must not throw
    const nullCalls = vi.mocked(mockUpdateTrayTitle).mock.calls.filter((c) => c[0] === null);
    expect(nullCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("C12: rapid reschedule between polls leaves no timer leaks", () => {
    const startDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "c12", startDate });
    scheduleEvents([event]);
    expect(timers.size).toBe(1);

    // First reschedule
    const r1 = makeEvent({ id: "c12", startDate: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
    scheduleEvents([r1]);

    // Second reschedule (only final state matters)
    const r2 = makeEvent({ id: "c12", startDate: new Date(Date.now() + 8 * 60 * 1000).toISOString() });
    scheduleEvents([r2]);

    // Must have exactly 1 timer, 1 countdown, 1 scheduledEventData entry
    expect(timers.size).toBe(1);
    expect(scheduledEventData.size).toBe(1);
    // Verify final startMs is the last reschedule
    const expectedMs = new Date(Date.now() + 8 * 60 * 1000).getTime();
    expect(scheduledEventData.get("c12")?.startMs).toBeCloseTo(expectedMs, -2);
  });

  it("C13: per-minute tick does not write stale title after ownership change", () => {
    const farStart = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const closeStart = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const far = makeEvent({ id: "far-c13", title: "Far Meeting", startDate: farStart });
    const close = makeEvent({ id: "close-c13", title: "Close Meeting", startDate: closeStart });

    // Both in countdown window
    scheduleEvents([far, close]);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Advance 1 minute — both per-minute ticks fire
    vi.advanceTimersByTime(60_000);

    // Only Close Meeting's title should appear; Far Meeting's tick must be suppressed
    const calls = vi.mocked(mockUpdateTrayTitle).mock.calls.filter((c) => c[0] !== null);
    const farCalls = calls.filter((c) => c[0] === "Far Meeting");
    expect(farCalls).toHaveLength(0);
    const closeCalls = calls.filter((c) => c[0] === "Close Meeting");
    expect(closeCalls.length).toBeGreaterThan(0);
  });

  it("E16/17: tray clears after 3 consecutive calendar errors; preserved on 2 errors + success", async () => {
    const startDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "e16", startDate });
    scheduleEvents([event]);
    expect(countdownIntervals.size).toBe(1);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    const { getCalendarEventsResult } = await import("../../src/main/calendar.js");
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "err", error: "permission denied" });

    // 2 errors — tray must still be showing
    await poll();
    await poll();
    expect(stateModule.getConsecutiveErrors()).toBe(2);
    expect(countdownIntervals.size).toBe(1); // countdown still alive

    // 3rd error — tray must clear
    await poll();
    expect(stateModule.getConsecutiveErrors()).toBe(3);
    expect(countdownIntervals.size).toBe(0);
    const nullCalls = vi.mocked(mockUpdateTrayTitle).mock.calls.filter((c) => c[0] === null);
    expect(nullCalls.length).toBeGreaterThanOrEqual(1);

    // Reset mock
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });
  });

  it("E16b: consecutiveErrors resets on success; 2 errors + success leaves tray intact", async () => {
    const startDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "e16b", startDate });
    scheduleEvents([event]);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    const { getCalendarEventsResult } = await import("../../src/main/calendar.js");
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "err", error: "permission denied" });

    await poll();
    await poll();
    expect(stateModule.getConsecutiveErrors()).toBe(2);

    // Success — errors reset, tray preserved
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [event] });
    await poll();
    expect(stateModule.getConsecutiveErrors()).toBe(0);
    expect(countdownIntervals.size).toBe(1);

    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });
  });

  it("E18: scheduleEvents([]) immediately clears tray", () => {
    const startDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "e18", startDate });
    scheduleEvents([event]);
    expect(countdownIntervals.size).toBe(1);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    scheduleEvents([]);

    expect(countdownIntervals.size).toBe(0);
    const nullCalls = vi.mocked(mockUpdateTrayTitle).mock.calls.filter((c) => c[0] === null);
    expect(nullCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("setSchedulerWindow and poll IPC notification", () => {
  let mockWebContentsSend: ReturnType<typeof vi.fn>;
  let mockWindow: { isDestroyed: ReturnType<typeof vi.fn>; webContents: { send: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    vi.useFakeTimers();
    timers.clear();
    firedEvents.clear();
    scheduledEventData.clear();
    countdownIntervals.clear();
    _resetForTest();
    refreshStateRefs();
    vi.mocked(mockUpdateTrayTitle).mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });

    // Create mock window with webContents.send
    mockWebContentsSend = vi.fn();
    mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: mockWebContentsSend,
        isDestroyed: vi.fn().mockReturnValue(false),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    timers.clear();
    firedEvents.clear();
    scheduledEventData.clear();
    countdownIntervals.clear();
    _resetForTest();
    refreshStateRefs();
    stateModule.state.powerCallbacks = null;
  });

  it("F1: setSchedulerWindow stores window reference for poll to use", async () => {
    const { getCalendarEventsResult } = await import("../../src/main/calendar.js");
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });

    setSchedulerWindow(mockWindow as never);
    await poll();

    expect(mockWebContentsSend).toHaveBeenCalledWith("calendar:events-updated", undefined);
  });

  it("F2: poll does NOT send IPC if window is null", async () => {
    const { getCalendarEventsResult } = await import("../../src/main/calendar.js");
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });

    // Don't set window - it should remain null
    setSchedulerWindow(null as never);
    await poll();

    expect(mockWebContentsSend).not.toHaveBeenCalled();
  });

  it("F3: poll does NOT send IPC if window is destroyed", async () => {
    const { getCalendarEventsResult } = await import("../../src/main/calendar.js");
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [] });

    mockWindow.isDestroyed.mockReturnValue(true);
    setSchedulerWindow(mockWindow as never);
    await poll();

    expect(mockWebContentsSend).not.toHaveBeenCalled();
  });

  it("F4: poll does NOT send IPC on calendar fetch error", async () => {
    const { getCalendarEventsResult } = await import("../../src/main/calendar.js");
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "err", error: "Calendar access denied" });

    setSchedulerWindow(mockWindow as never);
    await poll();

    expect(mockWebContentsSend).not.toHaveBeenCalled();
    expect(stateModule.getConsecutiveErrors()).toBe(1);
  });

  it("F5: poll sends IPC after successful fetch with events", async () => {
    const { getCalendarEventsResult } = await import("../../src/main/calendar.js");
    const event = makeEvent({ id: "f5-event" });
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ kind: "ok", events: [event] });

    setSchedulerWindow(mockWindow as never);
    await poll();

    expect(stateModule.getConsecutiveErrors()).toBe(0);
    expect(stateModule.getConsecutiveErrors()).toBe(0);
  });
});


describe("Wave 2: Dirty flag for title resolution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
    refreshStateRefs();
    vi.mocked(mockUpdateTrayTitle).mockClear();
    initPowerCallbacks({ getPollInterval: vi.fn().mockReturnValue(2 * 60 * 1000), preventSleep: vi.fn(), allowSleep: vi.fn() });
  });
  afterEach(() => {
    vi.useRealTimers();
    _resetForTest();
    refreshStateRefs();
    stateModule.state.powerCallbacks = null;
    vi.mocked(mockUpdateTrayTitle).mockClear();
  });

  it("resolveActiveTitleEvent returns cached value when !titleDirty", () => {
    // Schedule an event so countdown starts and activeTitleEventId is set
    const event = makeEvent({ id: "dirty-t1", startDate: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
    scheduleEvents([event]);

    // After scheduleEvents, titleDirty was set and resolved, so now titleDirty is false
    expect(stateModule.state.titleDirty).toBe(false);
    expect(stateModule.state.activeTitleEventId).toBe("dirty-t1");
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Call resolveActiveTitleEvent again — should early-return (not dirty, has cached value)
    resolveActiveTitleEvent();

    // Title callback should NOT have been called (early-returned)
    expect(mockUpdateTrayTitle).not.toHaveBeenCalled();
  });

  it("resolveActiveTitleEvent re-resolves after markTitleDirty()", () => {
    const event = makeEvent({ id: "dirty-t2", startDate: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
    scheduleEvents([event]);

    expect(stateModule.state.activeTitleEventId).toBe("dirty-t2");
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Mark dirty and call resolve — should re-resolve and call tray update
    markTitleDirty();
    expect(stateModule.state.titleDirty).toBe(true);

    resolveActiveTitleEvent();

    // Should have re-resolved and updated tray
    expect(mockUpdateTrayTitle).toHaveBeenCalledWith("Test Meeting", expect.any(Number));
    expect(stateModule.state.titleDirty).toBe(false);
  });

  it("resolveActiveInMeetingEvent returns cached value when !inMeetingDirty", () => {
    // Create an in-progress meeting to trigger in-meeting countdown
    const event = makeEvent({
      id: "dirty-im1",
      startDate: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // started 5 min ago
      endDate: new Date(Date.now() + 25 * 60 * 1000).toISOString(),  // ends in 25 min
    });
    scheduleEvents([event]);

    expect(stateModule.state.activeInMeetingEventId).toBe("dirty-im1");
    expect(stateModule.state.inMeetingDirty).toBe(false);
    vi.mocked(mockUpdateTrayTitle).mockClear();

    // Call resolveActiveInMeetingEvent — should early-return (not dirty, has cached value)
    resolveActiveInMeetingEvent();

    // Should NOT have called tray update (early-returned)
    expect(mockUpdateTrayTitle).not.toHaveBeenCalled();
  });

  it("scheduleEvents marks titleDirty when countdown starts", () => {
    const event = makeEvent({
      id: "dirty-s1",
      startDate: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    // Before scheduling, dirty flag is false (fresh state)
    expect(stateModule.state.titleDirty).toBe(false);

    scheduleEvents([event]);

    // After scheduling, resolveActiveTitleEvent was called which resets the flag
    // But the flag was set before resolve ran
    expect(stateModule.state.activeTitleEventId).toBe("dirty-s1");
    // After resolution, dirty is reset
    expect(stateModule.state.titleDirty).toBe(false);

    // Now delete the event — cleanup marks dirty and re-resolves
    scheduleEvents([]);
    expect(stateModule.state.activeTitleEventId).toBeNull();
  });

  it("scheduleEvents marks inMeetingDirty when in-meeting countdown starts/stops", () => {
    // In-progress event triggers in-meeting countdown
    const event = makeEvent({
      id: "dirty-s2",
      startDate: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 28 * 60 * 1000).toISOString(),
    });

    scheduleEvents([event]);

    // In-meeting countdown started → dirty was set and resolved
    expect(stateModule.state.activeInMeetingEventId).toBe("dirty-s2");
    expect(stateModule.state.inMeetingDirty).toBe(false); // resolved resets it

    // Remove the event — cleanup marks dirty and re-resolves
    scheduleEvents([]);
    expect(stateModule.state.activeInMeetingEventId).toBeNull();
  });
});
