import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { EventId } from "../../src/shared/brand.js";
import type { MeetingEvent } from "../../src/shared/meeting-event.js";
import type { ScheduledEventSnapshot } from "../../src/main/scheduler/state/index.js";
import { asTestEventId, createMockEvent } from "../helpers/test-utils.js";

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
  openMeetingUrl: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}));

const { Notification, shell } = await import("electron");
const { buildMeetUrl, openMeetingUrl } = await import("../../src/main/utils/meet-url.js");
const { scheduleBrowserTimer, cancelBrowserTimer } =
  await import("../../src/main/scheduler/browser-timer.js");

function makeEvent(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  return createMockEvent({
    id: asTestEventId("evt-1"),
    title: "Standup",
    userEmail: "user@test.com",
    ...overrides,
  });
}

describe("scheduleBrowserTimer", () => {
  let timers: Map<EventId, ReturnType<typeof setTimeout>>;
  let firedEvents: Map<EventId, number>;
  let scheduledEventData: Map<EventId, ScheduledEventSnapshot>;

  const effectiveDelay = 60_000;
  const startMs = Date.now() + 5 * 60 * 1000;
  const openAtMs = startMs - effectiveDelay;
  const endMs = Date.now() + 35 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    timers = new Map();
    firedEvents = new Map();
    scheduledEventData = new Map();
    vi.mocked(buildMeetUrl).mockClear();
    vi.mocked(shell.openExternal).mockClear();
    vi.mocked(openMeetingUrl).mockClear();
    vi.mocked(Notification).mockClear();
  });

  afterEach(() => {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
    vi.useRealTimers();
  });

  function schedule(event: MeetingEvent): void {
    scheduleBrowserTimer(
      event,
      effectiveDelay,
      openAtMs,
      startMs,
      endMs,
      timers,
      firedEvents,
      scheduledEventData,
    );
  }

  it("creates a timer and stores it in timers map", () => {
    const event = makeEvent();
    schedule(event);

    expect(timers.has(event.id)).toBe(true);
  });

  it("stores snapshot in scheduledEventData map", () => {
    const event = makeEvent();
    schedule(event);

    const snapshot = scheduledEventData.get(event.id);
    expect(snapshot).toEqual({
      title: "Standup",
      meetUrl: "https://meet.google.com/abc-def-ghi",
      openAtMs,
      startMs,
      endMs,
    });
  });

  it("adds event to firedEvents when timer fires", () => {
    const event = makeEvent();
    schedule(event);

    vi.advanceTimersByTime(60_000);
    expect(firedEvents.has(event.id)).toBe(true);
  });

  it("shows Notification when timer fires", () => {
    const event = makeEvent();
    schedule(event);

    vi.advanceTimersByTime(60_000);
    expect(Notification).toHaveBeenCalledWith({
      title: "Standup",
      body: expect.stringMatching(/^Starting (now|in \d+ min)$/),
    });
  });

  it("with meetUrl: opens browser via openMeetingUrl", () => {
    const event = makeEvent();
    schedule(event);

    vi.advanceTimersByTime(60_000);
    expect(openMeetingUrl).toHaveBeenCalledWith(
      "https://meet.google.com/abc-def-ghi?authuser=user@test.com",
    );
  });

  it("without meetUrl: does NOT open browser, just logs", () => {
    const event = makeEvent({ meetUrl: undefined });
    schedule(event);

    vi.advanceTimersByTime(60_000);
    expect(openMeetingUrl).not.toHaveBeenCalled();
    expect(buildMeetUrl).not.toHaveBeenCalled();
  });

  it("builds correct URL via buildMeetUrl()", () => {
    const event = makeEvent();
    schedule(event);

    vi.advanceTimersByTime(60_000);
    expect(buildMeetUrl).toHaveBeenCalledWith(event);
  });

  it("removes timer from map when timer fires", () => {
    const event = makeEvent();
    schedule(event);
    expect(timers.has(event.id)).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(timers.has(event.id)).toBe(false);
  });
});

describe("cancelBrowserTimer", () => {
  let timers: Map<EventId, ReturnType<typeof setTimeout>>;

  beforeEach(() => {
    vi.useFakeTimers();
    timers = new Map();
    vi.mocked(openMeetingUrl).mockClear();
  });

  afterEach(() => {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
    vi.useRealTimers();
  });

  it("clears timer and removes from map", () => {
    const event = makeEvent();
    const firedEvents = new Map<EventId, number>();
    const scheduledEventData = new Map<EventId, ScheduledEventSnapshot>();
    const startMs = Date.now();
    const openAtMs = startMs - 60_000;
    scheduleBrowserTimer(
      event,
      60_000,
      openAtMs,
      startMs,
      startMs + 30 * 60_000,
      timers,
      firedEvents,
      scheduledEventData,
    );
    expect(timers.has(event.id)).toBe(true);

    cancelBrowserTimer(event.id, timers);
    expect(timers.has(event.id)).toBe(false);

    // Timer should not fire after cancellation
    vi.advanceTimersByTime(60_000);
    expect(openMeetingUrl).not.toHaveBeenCalled();
  });

  it("is safe to call with non-existent eventId (no-op)", () => {
    expect(() => cancelBrowserTimer(asTestEventId("nonexistent"), timers)).not.toThrow();
    expect(timers.size).toBe(0);
  });
});

describe("scheduleBrowserTimer TTL suppression", () => {
  const FIFTEEN_MIN_MS = 15 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(openMeetingUrl).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("records expiry as endMs + 15min when timer fires", () => {
    const timers = new Map<EventId, ReturnType<typeof setTimeout>>();
    const firedEvents = new Map<EventId, number>();
    const scheduledEventData = new Map<EventId, ScheduledEventSnapshot>();
    const event = makeEvent();
    const startMs = Date.now() + 5 * 60_000;
    const openAtMs = startMs - 60_000;
    const endMs = Date.now() + 35 * 60_000;
    scheduleBrowserTimer(
      event,
      60_000,
      openAtMs,
      startMs,
      endMs,
      timers,
      firedEvents,
      scheduledEventData,
    );
    vi.advanceTimersByTime(60_000);
    expect(firedEvents.get(event.id)).toBe(endMs + FIFTEEN_MIN_MS);
  });
});
