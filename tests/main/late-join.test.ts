import { describe, it, expect, beforeEach } from "vitest";
import {
  getLateJoinGraceMs,
  isLateJoinEligible,
  _setLateJoinGraceMsForTest,
} from "../../src/main/scheduler/late-join.js";
import { asTestEventId, asTestMeetUrl, createMockEvent } from "../helpers/test-utils.js";

describe("late-join helpers", () => {
  beforeEach(() => {
    _setLateJoinGraceMsForTest(null);
  });

  it("defaults grace to 0", () => {
    expect(getLateJoinGraceMs()).toBe(0);
  });

  it("allows override for tests", () => {
    _setLateJoinGraceMsForTest(120_000);
    expect(getLateJoinGraceMs()).toBe(120_000);
  });

  it("is eligible only within grace and when not fired", () => {
    const now = Date.now();
    const startMs = now - 60_000;
    const endMs = now + 30 * 60_000;
    const event = createMockEvent({
      id: asTestEventId("e1"),
      meetUrl: asTestMeetUrl("https://meet.google.com/abc-def-ghi"),
      startDate: new Date(startMs).toISOString(),
      endDate: new Date(endMs).toISOString(),
    });
    const emptyFired = { firedEvents: new Map() };
    expect(isLateJoinEligible(event, startMs, endMs, now, 120_000, emptyFired)).toBe(true);

    const fired = { firedEvents: new Map([[event.id, endMs]]) };
    expect(isLateJoinEligible(event, startMs, endMs, now, 120_000, fired)).toBe(false);

    // cancelledEvents is not part of the view — eligibility must not depend on it
    expect(isLateJoinEligible(event, startMs, endMs, now, 0, emptyFired)).toBe(false);
  });
});
