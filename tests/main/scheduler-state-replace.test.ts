import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { CalendarResult } from "../../src/domain/entities/calendar-result.js";
import { asTestEventId } from "../helpers/test-utils.js";

vi.mock("electron", () => ({
  app: { getPath: vi.fn().mockReturnValue("/tmp/test-user-data") },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
}));

const stateModule = await import("../../src/main/scheduler/state/index.js");
const { createSchedulerState, replaceState, clearSchedulerResources } = stateModule;

describe("replaceState() preservation", () => {
  beforeEach(() => {
    // Fully reset module state before each test
    replaceState(createSchedulerState());
    stateModule.state.win = null;
    stateModule.state.onTrayTitleUpdate = null;
    stateModule.state.powerCallbacks = null;
    stateModule.state.lastKnownEvents = null;
  });

  it("preserves win, onTrayTitleUpdate, powerCallbacks, and lastKnownEvents from old state", () => {
    const fakeWin = { id: 42 } as unknown as BrowserWindow;
    const fakeCallback = vi.fn();
    const fakePower = {
      getPollInterval: () => 60_000,
      preventSleep: vi.fn(),
      allowSleep: vi.fn(),
    };
    const fakeEvents: CalendarResult = { kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] };

    stateModule.state.win = fakeWin;
    stateModule.state.onTrayTitleUpdate = fakeCallback;
    stateModule.state.powerCallbacks = fakePower;
    stateModule.state.lastKnownEvents = fakeEvents;

    const next = createSchedulerState();
    // Sanity: next defaults are blank
    expect(next.win).toBeNull();
    expect(next.lastKnownEvents).toBeNull();

    replaceState(next);

    expect(stateModule.state.win).toBe(fakeWin);
    expect(stateModule.state.onTrayTitleUpdate).toBe(fakeCallback);
    expect(stateModule.state.powerCallbacks).toBe(fakePower);
    expect(stateModule.state.lastKnownEvents).toBe(fakeEvents);
  });

  it("clears old timer handles even when preserving refs", () => {
    const cleared: Array<Parameters<typeof globalThis.clearTimeout>[0]> = [];
    const realClearTimeout = globalThis.clearTimeout;
    const spy = vi
      .spyOn(globalThis, "clearTimeout")
      .mockImplementation((h: Parameters<typeof realClearTimeout>[0]) => {
        if (h !== undefined) cleared.push(h);
        realClearTimeout(h);
      });

    const handle = setTimeout(() => {}, 1_000_000);
    stateModule.state.pollTimeout = handle;
    stateModule.state.lastKnownEvents = { kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] };

    replaceState(createSchedulerState());

    expect(cleared).toContain(handle);
    // Preserved across the swap
    expect(stateModule.state.lastKnownEvents).toEqual({ kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] });
    // pollTimeout is reset on the new state
    expect(stateModule.state.pollTimeout).toBeNull();

    spy.mockRestore();
  });
});

describe("clearSchedulerResources() sleep-prevention release", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("releases one sleep blocker per countdown interval on bulk reset", () => {
    const allowSleep = vi.fn();
    const s = createSchedulerState();
    s.powerCallbacks = {
      getPollInterval: () => 120_000,
      preventSleep: vi.fn(),
      allowSleep,
    };
    s.countdownIntervals.set(asTestEventId("bulk-countdown-a"), setInterval(() => {}, 60_000));
    s.countdownIntervals.set(asTestEventId("bulk-countdown-b"), setInterval(() => {}, 60_000));

    clearSchedulerResources(s);

    expect(allowSleep).toHaveBeenCalledTimes(2);
    expect(s.countdownIntervals.size).toBe(0);
  });

  it("does not release sleep when only clear timers are bulk reset", () => {
    const allowSleep = vi.fn();
    const s = createSchedulerState();
    s.powerCallbacks = {
      getPollInterval: () => 120_000,
      preventSleep: vi.fn(),
      allowSleep,
    };
    s.clearTimers.set(asTestEventId("clear-only"), setTimeout(() => {}, 60_000));

    clearSchedulerResources(s);

    expect(allowSleep).not.toHaveBeenCalled();
    expect(s.clearTimers.size).toBe(0);
  });

  it("clears countdown intervals without power callbacks", () => {
    const s = createSchedulerState();
    s.powerCallbacks = null;
    s.countdownIntervals.set(asTestEventId("no-power-callbacks"), setInterval(() => {}, 60_000));

    expect(() => clearSchedulerResources(s)).not.toThrow();
    expect(s.countdownIntervals.size).toBe(0);
  });

  it("releases countdown sleep blockers when preserving fired state", () => {
    const allowSleep = vi.fn();
    const s = createSchedulerState();
    s.powerCallbacks = {
      getPollInterval: () => 120_000,
      preventSleep: vi.fn(),
      allowSleep,
    };
    const eventId = asTestEventId("preserve-fired-countdown");
    s.countdownIntervals.set(eventId, setInterval(() => {}, 60_000));
    s.firedEvents.set(eventId, 123);

    clearSchedulerResources(s, { preserveFiredState: true });

    expect(allowSleep).toHaveBeenCalledTimes(1);
    expect(s.countdownIntervals.size).toBe(0);
    expect(s.firedEvents.get(eventId)).toBe(123);
  });
});
