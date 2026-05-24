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
  startScheduler,
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

describe("facade in-flight poll guard", () => {
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

  it("does not start a second concurrent poll() while one is in flight", async () => {
    // Make poll() slow: returns a manually-resolvable promise
    let resolveFirst: (v: { kind: "ok"; events: never[] }) => void = () => {};
    const firstPromise = new Promise<{ kind: "ok"; events: never[] }>((r) => {
      resolveFirst = r;
    });
    vi.mocked(getCalendarEventsResult).mockReturnValueOnce(firstPromise);

    // Kick off first forcePoll — it begins poll() and awaits getCalendarEventsResult
    const p1 = forcePoll();
    // Flush microtasks so poll() actually starts and calls getCalendarEventsResult
    await Promise.resolve();
    await Promise.resolve();
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    // Second forcePoll while first is still in-flight
    const p2 = forcePoll();
    await Promise.resolve();
    await Promise.resolve();
    // Guard must prevent a second concurrent poll() invocation
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    // Resolve the first poll. Queued follow-up must run exactly once.
    resolveFirst({ kind: "ok", events: [] });
    await p1;
    await p2;
    // Drain any queued follow-up microtasks
    await vi.advanceTimersByTimeAsync(0);

    // Exactly one follow-up poll fired (total = 2)
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(2);

    // Stop re-armed scheduled poll so it doesn't pollute later assertions
    if (stateModule.state.pollTimeout !== null) {
      clearTimeout(stateModule.state.pollTimeout);
      stateModule.state.pollTimeout = null;
    }
  });

  it("coalesces multiple overlapping requests into exactly one follow-up", async () => {
    let resolveFirst: (v: { kind: "ok"; events: never[] }) => void = () => {};
    const firstPromise = new Promise<{ kind: "ok"; events: never[] }>((r) => {
      resolveFirst = r;
    });
    vi.mocked(getCalendarEventsResult).mockReturnValueOnce(firstPromise);

    const p1 = forcePoll();
    await Promise.resolve();
    await Promise.resolve();
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    // Four overlapping requests while first is in-flight
    const p2 = forcePoll();
    const p3 = forcePoll();
    const p4 = forcePoll();
    const p5 = forcePoll();
    await Promise.resolve();
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    resolveFirst({ kind: "ok", events: [] });
    await Promise.all([p1, p2, p3, p4, p5]);
    await vi.advanceTimersByTimeAsync(0);

    // Only ONE follow-up poll regardless of how many requests arrived
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(2);

    if (stateModule.state.pollTimeout !== null) {
      clearTimeout(stateModule.state.pollTimeout);
      stateModule.state.pollTimeout = null;
    }
  });

  it("clears in-flight guard when poll() throws so scheduler is not stuck", async () => {
    // First poll rejects
    vi.mocked(getCalendarEventsResult).mockRejectedValueOnce(new Error("boom"));

    await forcePoll();
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    if (stateModule.state.pollTimeout !== null) {
      clearTimeout(stateModule.state.pollTimeout);
      stateModule.state.pollTimeout = null;
    }
    _resetForceTestState();

    // A subsequent forcePoll must still be able to run — guard must have cleared
    await forcePoll();
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(2);

    if (stateModule.state.pollTimeout !== null) {
      clearTimeout(stateModule.state.pollTimeout);
      stateModule.state.pollTimeout = null;
    }
  });

  it("prevents recursive scheduler timer poll from overlapping an in-flight forcePoll", async () => {
    // Start the scheduler — fires an initial guarded poll immediately
    let resolveFirst: (v: { kind: "ok"; events: never[] }) => void = () => {};
    const firstPromise = new Promise<{ kind: "ok"; events: never[] }>((r) => {
      resolveFirst = r;
    });
    vi.mocked(getCalendarEventsResult).mockReturnValueOnce(firstPromise);

    startScheduler();
    await Promise.resolve();
    await Promise.resolve();
    // Initial poll from startScheduler is in flight
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    // forcePoll while initial scheduler poll is still running
    const fp = forcePoll();
    await Promise.resolve();
    await Promise.resolve();
    // Guard must prevent a concurrent poll() from forcePoll
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    // Resolve the in-flight poll — queued follow-up runs exactly once
    resolveFirst({ kind: "ok", events: [] });
    await fp;
    await vi.advanceTimersByTimeAsync(0);
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(2);

    stopScheduler();
  });

  it("queues a new request that arrives while the follow-up poll itself is running", async () => {
    // First poll: slow
    let resolveFirst: (v: { kind: "ok"; events: never[] }) => void = () => {};
    const firstPromise = new Promise<{ kind: "ok"; events: never[] }>((r) => {
      resolveFirst = r;
    });
    // Second poll (the queued follow-up): also slow so we can race a request during it
    let resolveSecond: (v: { kind: "ok"; events: never[] }) => void = () => {};
    const secondPromise = new Promise<{ kind: "ok"; events: never[] }>((r) => {
      resolveSecond = r;
    });
    vi.mocked(getCalendarEventsResult)
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    // Start first poll
    const p1 = forcePoll();
    await Promise.resolve();
    await Promise.resolve();
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    // Request 2 arrives while p1 is in-flight — becomes the queued follow-up
    const p2 = forcePoll();
    await Promise.resolve();
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(1);

    // Resolve first poll — the queued follow-up (poll #2) now starts and is in-flight
    resolveFirst({ kind: "ok", events: [] });
    await Promise.resolve();
    await Promise.resolve();
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(2);

    // Advance wall time past the forcePoll coalesce window so request #3 is not deferred
    vi.setSystemTime(Date.now() + FORCE_POLL_COALESCE_MS + 1);

    // Request 3 arrives DURING the queued follow-up — must not be dropped
    const p3 = forcePoll();
    await Promise.resolve();
    // Still in follow-up #2; no additional poll yet
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(2);

    // Resolve follow-up #2 — a third poll must run for request 3
    resolveSecond({ kind: "ok", events: [] });
    await Promise.all([p1, p2, p3]);
    await vi.advanceTimersByTimeAsync(0);
    expect(getCalendarEventsResult).toHaveBeenCalledTimes(3);

    if (stateModule.state.pollTimeout !== null) {
      clearTimeout(stateModule.state.pollTimeout);
      stateModule.state.pollTimeout = null;
    }
  });
});
