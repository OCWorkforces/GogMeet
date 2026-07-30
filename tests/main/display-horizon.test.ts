import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setDisplayHorizonEvents,
  clearDisplayHorizon,
  onDisplayHorizonTick,
  _resetDisplayHorizonForTest,
  _hasDisplayHorizonTimerForTest,
} from "../../src/main/system/display-horizon.js";
import { asTestEventId, createMockEvent } from "../helpers/test-utils.js";

describe("display-horizon", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetDisplayHorizonForTest();
  });

  afterEach(() => {
    _resetDisplayHorizonForTest();
    vi.useRealTimers();
  });

  it("arms a timer and notifies listeners when a meeting ends", () => {
    const now = Date.UTC(2026, 6, 30, 14, 0, 0);
    vi.setSystemTime(now);
    const endMs = now + 30 * 60_000;
    const event = createMockEvent({
      id: asTestEventId("live"),
      startDate: new Date(now - 60 * 60_000).toISOString(),
      endDate: new Date(endMs).toISOString(),
    });

    const tick = vi.fn();
    onDisplayHorizonTick(tick);
    setDisplayHorizonEvents([event], now);
    expect(_hasDisplayHorizonTimerForTest()).toBe(true);

    vi.advanceTimersByTime(30 * 60_000);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("does not arm when all events have already ended", () => {
    const now = Date.UTC(2026, 6, 30, 16, 20, 0);
    vi.setSystemTime(now);
    const event = createMockEvent({
      id: asTestEventId("past"),
      startDate: new Date(now - 3 * 60 * 60_000).toISOString(),
      endDate: new Date(now - 50 * 60_000).toISOString(),
    });
    setDisplayHorizonEvents([event], now);
    expect(_hasDisplayHorizonTimerForTest()).toBe(false);
  });

  it("re-arms for the next meeting after the first ends", () => {
    const now = Date.UTC(2026, 6, 30, 14, 0, 0);
    vi.setSystemTime(now);
    const firstEnd = now + 10 * 60_000;
    // Second start is >15 min after first end so soft minute ticks do not dominate.
    const secondStart = now + 40 * 60_000;
    const secondEnd = now + 90 * 60_000;
    const a = createMockEvent({
      id: asTestEventId("a"),
      startDate: new Date(now - 60_000).toISOString(),
      endDate: new Date(firstEnd).toISOString(),
    });
    const b = createMockEvent({
      id: asTestEventId("b"),
      startDate: new Date(secondStart).toISOString(),
      endDate: new Date(secondEnd).toISOString(),
    });

    const tick = vi.fn();
    onDisplayHorizonTick(tick);
    setDisplayHorizonEvents([a, b], now);

    vi.advanceTimersByTime(10 * 60_000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(_hasDisplayHorizonTimerForTest()).toBe(true);

    // Jump to second start (30 min after first end)
    vi.advanceTimersByTime(30 * 60_000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("clearDisplayHorizon cancels the timer", () => {
    const now = Date.UTC(2026, 6, 30, 14, 0, 0);
    vi.setSystemTime(now);
    const event = createMockEvent({
      startDate: new Date(now - 60_000).toISOString(),
      endDate: new Date(now + 60 * 60_000).toISOString(),
    });
    const tick = vi.fn();
    onDisplayHorizonTick(tick);
    setDisplayHorizonEvents([event], now);
    clearDisplayHorizon();
    expect(_hasDisplayHorizonTimerForTest()).toBe(false);
    vi.advanceTimersByTime(60 * 60_000);
    expect(tick).not.toHaveBeenCalled();
  });

  it("continues notifying other listeners when one throws", () => {
    const now = Date.UTC(2026, 6, 30, 14, 0, 0);
    vi.setSystemTime(now);
    const event = createMockEvent({
      startDate: new Date(now - 60_000).toISOString(),
      endDate: new Date(now + 5 * 60_000).toISOString(),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = vi.fn();
    onDisplayHorizonTick(() => {
      throw new Error("listener boom");
    });
    onDisplayHorizonTick(good);
    setDisplayHorizonEvents([event], now);
    vi.advanceTimersByTime(5 * 60_000);
    expect(good).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("unsubscribe removes a listener", () => {
    const now = Date.UTC(2026, 6, 30, 14, 0, 0);
    vi.setSystemTime(now);
    const event = createMockEvent({
      startDate: new Date(now - 60_000).toISOString(),
      endDate: new Date(now + 5 * 60_000).toISOString(),
    });
    const tick = vi.fn();
    const unsub = onDisplayHorizonTick(tick);
    unsub();
    setDisplayHorizonEvents([event], now);
    vi.advanceTimersByTime(5 * 60_000);
    expect(tick).not.toHaveBeenCalled();
  });
});
