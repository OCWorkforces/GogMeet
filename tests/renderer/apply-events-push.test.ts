import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyEventsPush } from "../../src/renderer/lib/apply-events-push.js";
import type { AppState } from "../../src/shared/app-state.js";
import { DEFAULT_SETTINGS } from "../../src/shared/settings.js";
import type { AppSettings } from "../../src/shared/settings.js";
import { createMockEvent, isoFromNow } from "../helpers/test-utils.js";

const FIXED_NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();

function loadingState(): AppState {
  return { type: "loading" };
}

function hasEventsState(events: ReturnType<typeof createMockEvent>[]): AppState {
  return { type: "has-events", events };
}

function settingsWith(overrides: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("applyEventsPush", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders on first call (prevState=loading) and returns a non-empty signature", () => {
    const events = [createMockEvent({ id: "e1", startDate: isoFromNow(60) })];
    const result = applyEventsPush({
      events,
      settings: settingsWith(),
      prevState: loadingState(),
      prevSignature: "",
    });
    expect(result.didChange).toBe(true);
    expect(result.state.type).toBe("has-events");
    expect(result.signature).not.toBe("");
  });

  it("skips re-render when post-filter signature is unchanged and prevState is has-events", () => {
    const events = [createMockEvent({ id: "e1", startDate: isoFromNow(60) })];
    const first = applyEventsPush({
      events,
      settings: settingsWith(),
      prevState: loadingState(),
      prevSignature: "",
    });

    const second = applyEventsPush({
      events: [...events],
      settings: settingsWith(),
      prevState: first.state,
      prevSignature: first.signature,
    });
    expect(second.didChange).toBe(false);
    expect(second.signature).toBe(first.signature);
    expect(second.state).toBe(first.state);
  });

  it("re-renders when signature matches but prevState is NOT has-events (e.g. after error)", () => {
    const events = [createMockEvent({ id: "e1", startDate: isoFromNow(60) })];
    const first = applyEventsPush({
      events,
      settings: settingsWith(),
      prevState: loadingState(),
      prevSignature: "",
    });

    const errorState: AppState = { type: "error", message: "boom" };
    const second = applyEventsPush({
      events,
      settings: settingsWith(),
      prevState: errorState,
      prevSignature: first.signature,
    });
    expect(second.didChange).toBe(true);
    expect(second.state.type).toBe("has-events");
  });

  it("re-renders when only title changes (title is part of the shared signature)", () => {
    const base = createMockEvent({ id: "e1", title: "Standup", startDate: isoFromNow(60) });
    const first = applyEventsPush({
      events: [base],
      settings: settingsWith(),
      prevState: loadingState(),
      prevSignature: "",
    });

    const updated = createMockEvent({
      id: "e1",
      title: "Standup (rescheduled)",
      startDate: base.startDate,
      endDate: base.endDate,
    });
    const second = applyEventsPush({
      events: [updated],
      settings: settingsWith(),
      prevState: first.state,
      prevSignature: first.signature,
    });
    expect(second.didChange).toBe(true);
    expect(second.signature).not.toBe(first.signature);
  });

  it("treats reordered event lists as equal (sorted-by-signature)", () => {
    const a = createMockEvent({ id: "a", startDate: isoFromNow(60) });
    const b = createMockEvent({ id: "b", startDate: isoFromNow(120) });
    const first = applyEventsPush({
      events: [a, b],
      settings: settingsWith(),
      prevState: loadingState(),
      prevSignature: "",
    });
    const second = applyEventsPush({
      events: [b, a],
      settings: settingsWith(),
      prevState: first.state,
      prevSignature: first.signature,
    });
    expect(second.didChange).toBe(false);
    expect(second.signature).toBe(first.signature);
  });

  it("gates on the POST-filter signature: tomorrow-only change is a no-op when showTomorrowMeetings=false", () => {
    const today = createMockEvent({ id: "today", startDate: isoFromNow(60) });
    // Tomorrow at the same wall-clock time so isTomorrow() is true.
    const tomorrowStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const tomorrow1 = createMockEvent({ id: "tmr-1", title: "T1", startDate: tomorrowStart });
    const tomorrow2 = createMockEvent({ id: "tmr-2", title: "T2", startDate: tomorrowStart });

    const settings = settingsWith({ showTomorrowMeetings: false });
    const first = applyEventsPush({
      events: [today, tomorrow1],
      settings,
      prevState: loadingState(),
      prevSignature: "",
    });
    expect(first.didChange).toBe(true);
    expect(first.state.type).toBe("has-events");

    const second = applyEventsPush({
      events: [today, tomorrow2], // tomorrow-only difference
      settings,
      prevState: first.state,
      prevSignature: first.signature,
    });
    expect(second.didChange).toBe(false);
    expect(second.signature).toBe(first.signature);
  });

  it("transitions to no-events when the filter empties the list", () => {
    const tomorrowStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const tomorrowOnly = createMockEvent({ id: "tmr", startDate: tomorrowStart });
    const result = applyEventsPush({
      events: [tomorrowOnly],
      settings: settingsWith({ showTomorrowMeetings: false }),
      prevState: loadingState(),
      prevSignature: "",
    });
    expect(result.didChange).toBe(true);
    expect(result.state.type).toBe("no-events");
  });
});
