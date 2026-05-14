import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { CalendarResult } from "../../src/shared/calendar-result.js";

vi.mock("electron", () => ({
  app: { getPath: vi.fn().mockReturnValue("/tmp/test-user-data") },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
}));

const stateModule = await import("../../src/main/scheduler/state/index.js");
const { createSchedulerState, replaceState } = stateModule;

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
    const fakeEvents: CalendarResult = { kind: "ok", events: [] };

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
    const cleared: Array<ReturnType<typeof setTimeout>> = [];
    const realClearTimeout = globalThis.clearTimeout;
    const spy = vi
      .spyOn(globalThis, "clearTimeout")
      .mockImplementation((h: ReturnType<typeof setTimeout> | undefined) => {
        if (h !== undefined) cleared.push(h);
        realClearTimeout(h as Parameters<typeof realClearTimeout>[0]);
      });

    const handle = setTimeout(() => {}, 1_000_000);
    stateModule.state.pollTimeout = handle;
    stateModule.state.lastKnownEvents = { kind: "ok", events: [] };

    replaceState(createSchedulerState());

    expect(cleared).toContain(handle);
    // Preserved across the swap
    expect(stateModule.state.lastKnownEvents).toEqual({ kind: "ok", events: [] });
    // pollTimeout is reset on the new state
    expect(stateModule.state.pollTimeout).toBeNull();

    spy.mockRestore();
  });
});
