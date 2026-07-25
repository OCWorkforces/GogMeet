import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { EventId } from "../../src/shared/brand.js";
import type { MeetingEvent } from "../../src/shared/meeting-event.js";
import { asTestEventId, createMockEvent } from "../helpers/test-utils.js";

vi.mock("../../src/main/windows/alert-window.js", () => ({
  showAlert: vi.fn(),
}));

const { showAlert } = await import("../../src/main/windows/alert-window.js");
const { scheduleAlertTimer, cancelAlertTimer, ALERT_OFFSET_MS } =
  await import("../../src/main/scheduler/alert-timer.js");

function makeEvent(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  return createMockEvent({ id: asTestEventId("evt-1"), title: "Standup", ...overrides });
}

describe("scheduleAlertTimer", () => {
  let alertTimers: Map<EventId, ReturnType<typeof setTimeout>>;
  let alertFiredEvents: Map<EventId, number>;

  beforeEach(() => {
    vi.useFakeTimers();
    alertTimers = new Map();
    alertFiredEvents = new Map();
    vi.mocked(showAlert).mockReset();
  });

  afterEach(() => {
    for (const handle of alertTimers.values()) clearTimeout(handle);
    alertTimers.clear();
    vi.useRealTimers();
  });

  it("creates a timer and stores it in alertTimers map", () => {
    const event = makeEvent();
    scheduleAlertTimer(event, 120_000, Date.now() + 30 * 60_000, alertTimers, alertFiredEvents);

    expect(alertTimers.has(event.id)).toBe(true);
  });

  it("adds event to alertFiredEvents when timer fires", () => {
    const event = makeEvent();
    const delay = 120_000;
    scheduleAlertTimer(event, delay, Date.now() + 30 * 60_000, alertTimers, alertFiredEvents);

    vi.advanceTimersByTime(delay); // alertDelay = 120000 - 60000 = 60000
    expect(alertFiredEvents.has(event.id)).toBe(true);
  });

  it("calls showAlert(event) when timer fires", () => {
    const event = makeEvent();
    const delay = 120_000;
    scheduleAlertTimer(event, delay, Date.now() + 30 * 60_000, alertTimers, alertFiredEvents);

    vi.advanceTimersByTime(delay);
    expect(showAlert).toHaveBeenCalledWith(event, undefined);
  });

  it("calls showAlert for events without meetUrl", () => {
    const event = makeEvent({ meetUrl: undefined });
    const delay = 120_000;
    scheduleAlertTimer(event, delay, Date.now() + 30 * 60_000, alertTimers, alertFiredEvents);

    vi.advanceTimersByTime(delay);
    expect(showAlert).toHaveBeenCalledWith(event, undefined);
    expect(event.meetUrl).toBeUndefined();
  });

  it("catches errors from showAlert gracefully", () => {
    vi.mocked(showAlert).mockImplementation(() => {
      throw new Error("window creation failed");
    });

    const event = makeEvent();
    const delay = 120_000;
    scheduleAlertTimer(event, delay, Date.now() + 30 * 60_000, alertTimers, alertFiredEvents);

    // Should not throw
    expect(() => vi.advanceTimersByTime(delay)).not.toThrow();
    expect(alertFiredEvents.has(event.id)).toBe(true);
  });

  it("cancels existing timer before scheduling new one (idempotent)", () => {
    const event = makeEvent();
    scheduleAlertTimer(event, 120_000, Date.now() + 30 * 60_000, alertTimers, alertFiredEvents);
    const firstHandle = alertTimers.get("evt-1");

    scheduleAlertTimer(event, 180_000, Date.now() + 30 * 60_000, alertTimers, alertFiredEvents);
    const secondHandle = alertTimers.get("evt-1");

    expect(secondHandle).not.toBe(firstHandle);
    expect(alertTimers.size).toBe(1);

    // Advance past first delay — showAlert should NOT fire for the cancelled first timer
    vi.advanceTimersByTime(60_000); // 120000 - 60000 = 60000
    expect(showAlert).not.toHaveBeenCalled();

    // Advance to second timer: 180000 - 60000 = 120000
    vi.advanceTimersByTime(60_000);
    expect(showAlert).toHaveBeenCalledOnce();
  });

  it("calculates delay as effectiveDelay - ALERT_OFFSET_MS", () => {
    const event = makeEvent();
    const effectiveDelay = 90_000;
    const expectedAlertDelay = effectiveDelay - ALERT_OFFSET_MS; // 30000

    scheduleAlertTimer(event, effectiveDelay, Date.now() + 30 * 60_000, alertTimers, alertFiredEvents);

    // Should NOT have fired yet at 29999ms
    vi.advanceTimersByTime(expectedAlertDelay - 1);
    expect(showAlert).not.toHaveBeenCalled();

    // Should fire at exactly 30000ms
    vi.advanceTimersByTime(1);
    expect(showAlert).toHaveBeenCalledOnce();
  });

  it("uses Math.max(0, ...) for delay (no negative delays)", () => {
    const event = makeEvent();
    // effectiveDelay < ALERT_OFFSET_MS → delay should be 0
    scheduleAlertTimer(event, 30_000, Date.now() + 30 * 60_000, alertTimers, alertFiredEvents);

    // Should fire immediately (delay 0)
    vi.advanceTimersByTime(0);
    expect(showAlert).toHaveBeenCalledOnce();
  });

  it("removes timer from map when timer fires", () => {
    const event = makeEvent();
    scheduleAlertTimer(event, 120_000, Date.now() + 30 * 60_000, alertTimers, alertFiredEvents);
    expect(alertTimers.has(event.id)).toBe(true);

    vi.advanceTimersByTime(60_000); // 120000 - 60000 = 60000
    expect(alertTimers.has(event.id)).toBe(false);
  });
});

describe("cancelAlertTimer", () => {
  let alertTimers: Map<EventId, ReturnType<typeof setTimeout>>;

  beforeEach(() => {
    vi.useFakeTimers();
    alertTimers = new Map();
    vi.mocked(showAlert).mockReset();
  });

  afterEach(() => {
    for (const handle of alertTimers.values()) clearTimeout(handle);
    alertTimers.clear();
    vi.useRealTimers();
  });

  it("clears timer and removes from map", () => {
    const alertFiredEvents = new Map<EventId, number>();
    const event = makeEvent();
    scheduleAlertTimer(event, 120_000, Date.now() + 30 * 60_000, alertTimers, alertFiredEvents);
    expect(alertTimers.has(event.id)).toBe(true);

    cancelAlertTimer(event.id, alertTimers);
    expect(alertTimers.has(event.id)).toBe(false);

    // Timer should not fire after cancellation
    vi.advanceTimersByTime(120_000);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it("is safe to call with non-existent eventId (no-op)", () => {
    expect(() => cancelAlertTimer(asTestEventId("nonexistent"), alertTimers)).not.toThrow();
    expect(alertTimers.size).toBe(0);
  });
});

describe("scheduleAlertTimer TTL suppression", () => {
  let alertTimers: Map<EventId, ReturnType<typeof setTimeout>>;
  let alertFiredEvents: Map<EventId, number>;
  const FIFTEEN_MIN_MS = 15 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    alertTimers = new Map();
    alertFiredEvents = new Map();
    vi.mocked(showAlert).mockReset();
  });

  afterEach(() => {
    for (const handle of alertTimers.values()) clearTimeout(handle);
    alertTimers.clear();
    vi.useRealTimers();
  });

  it("records expiry as endMs + 15min when timer fires", () => {
    const event = makeEvent();
    const endMs = Date.now() + 30 * 60_000;
    scheduleAlertTimer(event, 120_000, endMs, alertTimers, alertFiredEvents);
    vi.advanceTimersByTime(60_000);
    expect(alertFiredEvents.get(event.id)).toBe(endMs + FIFTEEN_MIN_MS);
  });
});
