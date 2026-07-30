import { describe, it, expect } from "vitest";
import {
  calendarErr,
  calendarLiveOk,
  calendarOfflineOk,
  isCalendarAutomationEligible,
  isCalendarLiveOk,
  isCalendarOfflineOk,
  isCalendarOk,
  isValidCalendarTimestamp,
} from "../../src/domain/entities/calendar-result.js";
import { createMockEvent } from "../helpers/test-utils.js";

describe("calendar-result provenance", () => {
  const events = [createMockEvent()];

  it("builds live complete and offline variants without optional metadata", () => {
    const live = calendarLiveOk(events, "complete", 1_000);
    expect(live).toEqual({
      kind: "ok",
      source: "live",
      completeness: "complete",
      observedAt: 1_000,
      events,
    });
    const offline = calendarOfflineOk(events, 900, 1_100);
    expect(offline.source).toBe("offline-cache");
    expect(offline.cachedAt).toBe(1_100);
    expect(offline.observedAt).toBe(900);
  });

  it("narrows ok variants exhaustively", () => {
    const live = calendarLiveOk([], "partial", Date.now());
    const offline = calendarOfflineOk([], 1, 2);
    const err = calendarErr("x", "runtime");

    expect(isCalendarOk(live)).toBe(true);
    expect(isCalendarOk(offline)).toBe(true);
    expect(isCalendarOk(err)).toBe(false);
    expect(isCalendarLiveOk(live)).toBe(true);
    expect(isCalendarLiveOk(offline)).toBe(false);
    expect(isCalendarOfflineOk(offline)).toBe(true);
    expect(isCalendarAutomationEligible(live)).toBe(false); // partial
    expect(isCalendarAutomationEligible(calendarLiveOk([], "complete"))).toBe(true);
    expect(isCalendarAutomationEligible(offline)).toBe(false);
  });

  it("rejects non-finite and far-future timestamps", () => {
    const now = 1_000_000;
    expect(isValidCalendarTimestamp(now, now)).toBe(true);
    expect(isValidCalendarTimestamp(now + 4 * 60_000, now)).toBe(true);
    expect(isValidCalendarTimestamp(now + 6 * 60_000, now)).toBe(false);
    expect(isValidCalendarTimestamp(Number.NaN, now)).toBe(false);
    expect(isValidCalendarTimestamp(Number.POSITIVE_INFINITY, now)).toBe(false);
  });
});
