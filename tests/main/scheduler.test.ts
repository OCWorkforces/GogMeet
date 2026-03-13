import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MeetingEvent } from "../../src/shared/types.js";

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
  getCalendarEventsResult: vi.fn().mockResolvedValue({ events: [] }),
}));

// Mock tray module so updateTrayTitle can be spied on
vi.mock("../../src/main/tray.js", () => ({
  updateTrayTitle: vi.fn(),
}));

const schedulerModule = await import("../../src/main/scheduler.js");
const { scheduleEvents, firedEvents, scheduledEventData, timers } = schedulerModule;

const { updateTrayTitle } = await import("../../src/main/tray.js");

function makeEvent(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  return {
    id: "test-id",
    title: "Test Meeting",
    startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min from now
    endDate: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
    meetUrl: "https://meet.google.com/abc-def-ghi",
    calendarName: "Work",
    isAllDay: false,
    userEmail: "user@example.com",
    ...overrides,
  };
}

describe("scheduleEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    timers.clear();
    firedEvents.clear();
    scheduledEventData.clear();
    schedulerModule.countdownIntervals.clear();
    schedulerModule._resetConsecutiveErrors();
    vi.mocked(updateTrayTitle).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    timers.clear();
    firedEvents.clear();
    scheduledEventData.clear();
    schedulerModule.countdownIntervals.clear();
    schedulerModule._resetConsecutiveErrors();
    vi.mocked(updateTrayTitle).mockClear();
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
    expect(vi.mocked(updateTrayTitle)).toHaveBeenCalledWith("Test Meeting", expect.any(Number));
    vi.mocked(updateTrayTitle).mockClear();

    // Next poll — event deleted
    scheduleEvents([]);

    expect(vi.mocked(updateTrayTitle)).toHaveBeenCalledWith(null);
  });

  it("A5: second event is promoted when the earliest countdown event is deleted", () => {
    const first = makeEvent({ id: "first", title: "First Meeting", startDate: new Date(Date.now() + 8 * 60 * 1000).toISOString() });
    const second = makeEvent({ id: "second", title: "Second Meeting", startDate: new Date(Date.now() + 20 * 60 * 1000).toISOString() });
    scheduleEvents([first, second]);
    vi.mocked(updateTrayTitle).mockClear();

    // Delete the first (earliest) — second should take over
    scheduleEvents([second]);

    const calls = vi.mocked(updateTrayTitle).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toBe("Second Meeting");
  });

  it("A6: tray is unchanged when the non-active second event is deleted", () => {
    const first = makeEvent({ id: "first", title: "First Meeting", startDate: new Date(Date.now() + 8 * 60 * 1000).toISOString() });
    const second = makeEvent({ id: "second", title: "Second Meeting", startDate: new Date(Date.now() + 20 * 60 * 1000).toISOString() });
    scheduleEvents([first, second]);
    vi.mocked(updateTrayTitle).mockClear();

    // Delete second (non-owning) — first should still be shown
    scheduleEvents([first]);

    const calls = vi.mocked(updateTrayTitle).mock.calls;
    const calledWithNull = calls.some((c) => c[0] === null);
    expect(calledWithNull).toBe(false);
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toBe("First Meeting");
  });

  it("A7: tray clears when all countdown events are deleted simultaneously", () => {
    const e1 = makeEvent({ id: "e1", title: "Meeting 1", startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    const e2 = makeEvent({ id: "e2", title: "Meeting 2", startDate: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
    scheduleEvents([e1, e2]);
    vi.mocked(updateTrayTitle).mockClear();

    scheduleEvents([]); // all gone

    expect(vi.mocked(updateTrayTitle)).toHaveBeenCalledWith(null);
  });

  // ─── Group D: Multiple concurrent countdowns ─────────────────────────────

  it("D14: earliest-starting event owns the tray — later event never overwrites", () => {
    const earlier = makeEvent({ id: "earlier", title: "Early Meeting", startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    const later = makeEvent({ id: "later", title: "Late Meeting", startDate: new Date(Date.now() + 20 * 60 * 1000).toISOString() });
    scheduleEvents([earlier, later]);

    // Advance 1 min to trigger per-minute ticks on both countdowns
    vi.advanceTimersByTime(60_000);

    const nonNullCalls = vi.mocked(updateTrayTitle).mock.calls.filter((c) => c[0] !== null);
    const lastContentCall = nonNullCalls[nonNullCalls.length - 1];
    expect(lastContentCall?.[0]).toBe("Early Meeting");
    const laterCalls = nonNullCalls.filter((c) => c[0] === "Late Meeting");
    expect(laterCalls).toHaveLength(0);
  });

  it("D15: a new closer event entering the window takes tray ownership", () => {
    const far = makeEvent({ id: "far", title: "Far Meeting", startDate: new Date(Date.now() + 25 * 60 * 1000).toISOString() });
    scheduleEvents([far]);
    vi.mocked(updateTrayTitle).mockClear();

    // Second poll: closer event enters window alongside far
    const close = makeEvent({ id: "close", title: "Close Meeting", startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    scheduleEvents([far, close]);

    const calls = vi.mocked(updateTrayTitle).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toBe("Close Meeting");
  });

  // ─── Group B: Title/URL changes (same start time) ──────────────────────────

  it("B8: title change while in countdown updates tray immediately without rescheduling", () => {
    const startDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "b8", title: "Old Title", startDate });
    scheduleEvents([event]);
    const timerHandleBefore = timers.get("b8");
    vi.mocked(updateTrayTitle).mockClear();

    // Next poll — same event, same time, only title changed
    const renamed = makeEvent({ id: "b8", title: "New Title", startDate });
    scheduleEvents([renamed]);

    // Tray should update with new title
    expect(vi.mocked(updateTrayTitle)).toHaveBeenCalledWith("New Title", expect.any(Number));
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
    vi.mocked(updateTrayTitle).mockClear();

    // Next poll — same event, same time, only URL changed
    const urlChanged = makeEvent({ id: "b9", title: "Meeting", meetUrl: "https://meet.google.com/new-url", startDate });
    scheduleEvents([urlChanged]);

    // Browser-open timer MUST have been rescheduled (new handle)
    expect(timers.get("b9")).not.toBe(timerHandleBefore);
    expect(timers.has("b9")).toBe(true);
    // scheduledEventData should reflect the new URL
    expect(scheduledEventData.get("b9")?.meetUrl).toBe("https://meet.google.com/new-url");
  });

  // ─── Group A continued: Rescheduled-time edge cases ───────────────────────

  it("A2: event rescheduled beyond 30-min window clears tray and schedules future title timer", () => {
    const inWindowStart = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "a2", startDate: inWindowStart });
    scheduleEvents([event]);
    expect(vi.mocked(updateTrayTitle)).toHaveBeenCalledWith("Test Meeting", expect.any(Number));
    vi.mocked(updateTrayTitle).mockClear();

    // Rescheduled to 45 min away (outside 30-min window)
    const rescheduled = makeEvent({ id: "a2", startDate: new Date(Date.now() + 45 * 60 * 1000).toISOString() });
    scheduleEvents([rescheduled]);

    // Tray must clear (no more active countdown)
    expect(vi.mocked(updateTrayTitle)).toHaveBeenCalledWith(null);
    // A future title timer must be set
    expect(timers.has("a2")).toBe(true); // browser open timer rescheduled
  });

  it("A3: event rescheduled closer restarts countdown with corrected remaining time", () => {
    const originalStart = new Date(Date.now() + 25 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "a3", startDate: originalStart });
    scheduleEvents([event]);
    vi.mocked(updateTrayTitle).mockClear();

    // Rescheduled to 10 min away (still in window, but closer)
    const newStart = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const rescheduled = makeEvent({ id: "a3", startDate: newStart });
    scheduleEvents([rescheduled]);

    // Countdown must show ~10 mins remaining, not ~25
    const calls = vi.mocked(updateTrayTitle).mock.calls.filter((c) => c[0] !== null);
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toBeLessThanOrEqual(10);
    expect(lastCall?.[1]).toBeGreaterThan(0);
  });

  it("A4: event rescheduled to tomorrow clears tray and reschedules all timers", () => {
    const inWindowStart = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "a4", startDate: inWindowStart });
    scheduleEvents([event]);
    vi.mocked(updateTrayTitle).mockClear();

    // Rescheduled to 23 hours away
    const tomorrow = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    const rescheduled = makeEvent({ id: "a4", startDate: tomorrow });
    scheduleEvents([rescheduled]);

    // Tray must clear
    expect(vi.mocked(updateTrayTitle)).toHaveBeenCalledWith(null);
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
    vi.mocked(updateTrayTitle).mockClear();

    // Event is deleted before the titleTimer fires
    scheduleEvents([]);

    // Now advance past the titleTimer fire time
    vi.advanceTimersByTime(6 * 60 * 1000);

    // startCountdown should have bailed — no countdown interval, no tray update with a title
    const calls = vi.mocked(updateTrayTitle).mock.calls;
    const titleCalls = calls.filter((c) => c[0] !== null);
    expect(titleCalls).toHaveLength(0);
  });

  it("C11: tray clear at meeting start is idempotent when event also disappears from poll", () => {
    const startDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "c11", startDate });
    scheduleEvents([event]);
    vi.mocked(updateTrayTitle).mockClear();

    // Advance to meeting start — clearTimer fires, clearing the tray
    vi.advanceTimersByTime(5 * 60 * 1000 + 100);

    // Simultaneously, next poll returns no events (already started / deleted)
    scheduleEvents([]);

    // updateTrayTitle(null) may be called multiple times but must not throw
    const nullCalls = vi.mocked(updateTrayTitle).mock.calls.filter((c) => c[0] === null);
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
    vi.mocked(updateTrayTitle).mockClear();

    // Advance 1 minute — both per-minute ticks fire
    vi.advanceTimersByTime(60_000);

    // Only Close Meeting's title should appear; Far Meeting's tick must be suppressed
    const calls = vi.mocked(updateTrayTitle).mock.calls.filter((c) => c[0] !== null);
    const farCalls = calls.filter((c) => c[0] === "Far Meeting");
    expect(farCalls).toHaveLength(0);
    const closeCalls = calls.filter((c) => c[0] === "Close Meeting");
    expect(closeCalls.length).toBeGreaterThan(0);
  });

  it("E16/17: tray clears after 3 consecutive calendar errors; preserved on 2 errors + success", async () => {
    const startDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "e16", startDate });
    scheduleEvents([event]);
    expect(schedulerModule.countdownIntervals.size).toBe(1);
    vi.mocked(updateTrayTitle).mockClear();

    const { getCalendarEventsResult } = await import("../../src/main/calendar.js");
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ error: "permission denied" } as never);

    // 2 errors — tray must still be showing
    await schedulerModule.poll();
    await schedulerModule.poll();
    expect(schedulerModule.consecutiveErrors).toBe(2);
    expect(schedulerModule.countdownIntervals.size).toBe(1); // countdown still alive

    // 3rd error — tray must clear
    await schedulerModule.poll();
    expect(schedulerModule.consecutiveErrors).toBe(3);
    expect(schedulerModule.countdownIntervals.size).toBe(0);
    const nullCalls = vi.mocked(updateTrayTitle).mock.calls.filter((c) => c[0] === null);
    expect(nullCalls.length).toBeGreaterThanOrEqual(1);

    // Reset mock
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ events: [] });
  });

  it("E16b: consecutiveErrors resets on success; 2 errors + success leaves tray intact", async () => {
    const startDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "e16b", startDate });
    scheduleEvents([event]);
    vi.mocked(updateTrayTitle).mockClear();

    const { getCalendarEventsResult } = await import("../../src/main/calendar.js");
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ error: "permission denied" } as never);

    await schedulerModule.poll();
    await schedulerModule.poll();
    expect(schedulerModule.consecutiveErrors).toBe(2);

    // Success — errors reset, tray preserved
    vi.mocked(getCalendarEventsResult).mockResolvedValue({ events: [event] });
    await schedulerModule.poll();
    expect(schedulerModule.consecutiveErrors).toBe(0);
    expect(schedulerModule.countdownIntervals.size).toBe(1);

    vi.mocked(getCalendarEventsResult).mockResolvedValue({ events: [] });
  });

  it("E18: scheduleEvents([]) immediately clears tray", () => {
    const startDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const event = makeEvent({ id: "e18", startDate });
    scheduleEvents([event]);
    expect(schedulerModule.countdownIntervals.size).toBe(1);
    vi.mocked(updateTrayTitle).mockClear();

    scheduleEvents([]);

    expect(schedulerModule.countdownIntervals.size).toBe(0);
    const nullCalls = vi.mocked(updateTrayTitle).mock.calls.filter((c) => c[0] === null);
    expect(nullCalls.length).toBeGreaterThanOrEqual(1);
  });
});
