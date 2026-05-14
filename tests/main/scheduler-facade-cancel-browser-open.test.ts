import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { asTestEventId } from "../helpers/test-utils.js";

describe("scheduler/facade.cancelPendingBrowserOpen", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears the pending browser timer for the given event id", async () => {
    const stateModule = await import("../../src/main/scheduler/state/index.js");
    const facade = await import("../../src/main/scheduler/facade.js");

    const id = asTestEventId("evt-cancel-1");
    const handle = setTimeout(() => {
      throw new Error("browser timer should have been cancelled");
    }, 60_000);
    stateModule.state.timers.set(id, handle);
    stateModule.state.scheduledEventData.set(id, {
      title: "Test",
      meetUrl: undefined,
      startMs: Date.now() + 60_000,
      endMs: Date.now() + 30 * 60_000,
    });

    facade.cancelPendingBrowserOpen(id);

    expect(stateModule.state.timers.has(id)).toBe(false);

    // Advancing time must not throw — the timer is gone
    vi.advanceTimersByTime(120_000);
  });

  it("marks event as fired so refresh polls do not re-arm it", async () => {
    const stateModule = await import("../../src/main/scheduler/state/index.js");
    const facade = await import("../../src/main/scheduler/facade.js");

    const id = asTestEventId("evt-cancel-2");
    facade.cancelPendingBrowserOpen(id);

    expect(stateModule.state.firedEvents.has(id)).toBe(true);
  });

  it("is idempotent — second call does not throw and keeps fired set stable", async () => {
    const stateModule = await import("../../src/main/scheduler/state/index.js");
    const facade = await import("../../src/main/scheduler/facade.js");

    const id = asTestEventId("evt-cancel-3");
    facade.cancelPendingBrowserOpen(id);
    expect(() => facade.cancelPendingBrowserOpen(id)).not.toThrow();
    expect(stateModule.state.firedEvents.has(id)).toBe(true);
  });

  it("safe to call when no timer exists for the id", async () => {
    const stateModule = await import("../../src/main/scheduler/state/index.js");
    const facade = await import("../../src/main/scheduler/facade.js");

    const id = asTestEventId("evt-cancel-missing");
    expect(() => facade.cancelPendingBrowserOpen(id)).not.toThrow();
    expect(stateModule.state.timers.has(id)).toBe(false);
    expect(stateModule.state.firedEvents.has(id)).toBe(true);
  });
});
