import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MeetingEvent } from "../../src/shared/models.js";
import type { ScheduledEventSnapshot } from "../../src/main/scheduler/state.js";

// Override the global electron mock with a constructable Notification
vi.mock("electron", () => {
  const MockNotification = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.show = vi.fn();
  });
  return {
    Notification: MockNotification,
    shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  };
});

vi.mock("../../src/main/utils/meet-url.js", () => ({
  buildMeetUrl: vi
    .fn()
    .mockReturnValue(
      "https://meet.google.com/abc-def-ghi?authuser=user@test.com",
    ),
}));

const { Notification, shell } = await import("electron");
const { buildMeetUrl } = await import("../../src/main/utils/meet-url.js");
const { scheduleBrowserTimer, cancelBrowserTimer } =
  await import("../../src/main/scheduler/browser-timer.js");

function makeEvent(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  return {
    id: "evt-1",
    title: "Standup",
    startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    endDate: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
    meetUrl: "https://meet.google.com/abc-def-ghi",
    calendarName: "Work",
    isAllDay: false,
    userEmail: "user@test.com",
    ...overrides,
  };
}

describe("scheduleBrowserTimer", () => {
  let timers: Map<string, ReturnType<typeof setTimeout>>;
  let firedEvents: Set<string>;
  let scheduledEventData: Map<string, ScheduledEventSnapshot>;

  const startMs = Date.now() + 5 * 60 * 1000;
  const endMs = Date.now() + 35 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    timers = new Map();
    firedEvents = new Set();
    scheduledEventData = new Map();
    vi.mocked(buildMeetUrl).mockClear();
    vi.mocked(shell.openExternal).mockClear();
    vi.mocked(Notification).mockClear();
  });

  afterEach(() => {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
    vi.useRealTimers();
  });

  it("creates a timer and stores it in timers map", () => {
    const event = makeEvent();
    scheduleBrowserTimer(
      event,
      60_000,
      startMs,
      endMs,
      timers,
      firedEvents,
      scheduledEventData,
    );

    expect(timers.has("evt-1")).toBe(true);
  });

  it("stores snapshot in scheduledEventData map", () => {
    const event = makeEvent();
    scheduleBrowserTimer(
      event,
      60_000,
      startMs,
      endMs,
      timers,
      firedEvents,
      scheduledEventData,
    );

    const snapshot = scheduledEventData.get("evt-1");
    expect(snapshot).toEqual({
      title: "Standup",
      meetUrl: "https://meet.google.com/abc-def-ghi",
      startMs,
      endMs,
    });
  });

  it("adds event to firedEvents when timer fires", () => {
    const event = makeEvent();
    scheduleBrowserTimer(
      event,
      60_000,
      startMs,
      endMs,
      timers,
      firedEvents,
      scheduledEventData,
    );

    vi.advanceTimersByTime(60_000);
    expect(firedEvents.has("evt-1")).toBe(true);
  });

  it("shows Notification when timer fires", () => {
    const event = makeEvent();
    scheduleBrowserTimer(
      event,
      60_000,
      startMs,
      endMs,
      timers,
      firedEvents,
      scheduledEventData,
    );

    vi.advanceTimersByTime(60_000);
    expect(Notification).toHaveBeenCalledWith({
      title: "Standup",
      body: "Starting now",
    });
  });

  it("with meetUrl: opens browser via shell.openExternal", () => {
    const event = makeEvent();
    scheduleBrowserTimer(
      event,
      60_000,
      startMs,
      endMs,
      timers,
      firedEvents,
      scheduledEventData,
    );

    vi.advanceTimersByTime(60_000);
    expect(shell.openExternal).toHaveBeenCalledWith(
      "https://meet.google.com/abc-def-ghi?authuser=user@test.com",
    );
  });

  it("without meetUrl: does NOT open browser, just logs", () => {
    const event = makeEvent({ meetUrl: undefined });
    scheduleBrowserTimer(
      event,
      60_000,
      startMs,
      endMs,
      timers,
      firedEvents,
      scheduledEventData,
    );

    vi.advanceTimersByTime(60_000);
    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(buildMeetUrl).not.toHaveBeenCalled();
  });

  it("builds correct URL via buildMeetUrl()", () => {
    const event = makeEvent();
    scheduleBrowserTimer(
      event,
      60_000,
      startMs,
      endMs,
      timers,
      firedEvents,
      scheduledEventData,
    );

    vi.advanceTimersByTime(60_000);
    expect(buildMeetUrl).toHaveBeenCalledWith(event);
  });

  it("removes timer from map when timer fires", () => {
    const event = makeEvent();
    scheduleBrowserTimer(
      event,
      60_000,
      startMs,
      endMs,
      timers,
      firedEvents,
      scheduledEventData,
    );
    expect(timers.has("evt-1")).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(timers.has("evt-1")).toBe(false);
  });
});

describe("cancelBrowserTimer", () => {
  let timers: Map<string, ReturnType<typeof setTimeout>>;

  beforeEach(() => {
    vi.useFakeTimers();
    timers = new Map();
    vi.mocked(shell.openExternal).mockClear();
  });

  afterEach(() => {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
    vi.useRealTimers();
  });

  it("clears timer and removes from map", () => {
    const event = makeEvent();
    const firedEvents = new Set<string>();
    const scheduledEventData = new Map<string, ScheduledEventSnapshot>();
    scheduleBrowserTimer(
      event,
      60_000,
      Date.now(),
      Date.now() + 30 * 60_000,
      timers,
      firedEvents,
      scheduledEventData,
    );
    expect(timers.has("evt-1")).toBe(true);

    cancelBrowserTimer("evt-1", timers);
    expect(timers.has("evt-1")).toBe(false);

    // Timer should not fire after cancellation
    vi.advanceTimersByTime(60_000);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it("is safe to call with non-existent eventId (no-op)", () => {
    expect(() => cancelBrowserTimer("nonexistent", timers)).not.toThrow();
    expect(timers.size).toBe(0);
  });
});
