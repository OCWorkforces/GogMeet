import { describe, it, expect } from "vitest";
import {
  isMeetingInProgress,
  isMeetingNotEnded,
  filterUpcomingMeetings,
  filterCompletedTodayMeetings,
  isCompletedTodayMeeting,
  nextDisplayHorizonMs,
} from "../../src/domain/services/meeting-time.js";
import { asTestEventId, createMockEvent } from "../helpers/test-utils.js";

function eventAt(
  startOffsetMs: number,
  endOffsetMs: number,
  extras: Partial<Parameters<typeof createMockEvent>[0]> = {},
) {
  const base = Date.UTC(2026, 6, 30, 12, 0, 0);
  return createMockEvent({
    id: asTestEventId(extras.id ?? "e1"),
    startDate: new Date(base + startOffsetMs).toISOString(),
    endDate: new Date(base + endOffsetMs).toISOString(),
    ...extras,
  });
}

const NOON = Date.UTC(2026, 6, 30, 12, 0, 0);

describe("isMeetingInProgress", () => {
  it("is true when now is between start and end", () => {
    const e = eventAt(-30 * 60_000, 60 * 60_000);
    expect(isMeetingInProgress(e, NOON)).toBe(true);
  });

  it("is false before start", () => {
    const e = eventAt(30 * 60_000, 90 * 60_000);
    expect(isMeetingInProgress(e, NOON)).toBe(false);
  });

  it("is false at exact end (end exclusive)", () => {
    const e = eventAt(-90 * 60_000, 0);
    expect(isMeetingInProgress(e, NOON)).toBe(false);
  });

  it("is true at exact start", () => {
    const e = eventAt(0, 60 * 60_000);
    expect(isMeetingInProgress(e, NOON)).toBe(true);
  });

  it("is false for invalid dates", () => {
    const e = {
      ...createMockEvent({ id: asTestEventId("bad") }),
      startDate: "not-a-date",
      endDate: "also-bad",
    } as ReturnType<typeof createMockEvent>;
    expect(isMeetingInProgress(e, NOON)).toBe(false);
  });
});

describe("isMeetingNotEnded", () => {
  it("is true while end is in the future", () => {
    const e = eventAt(-30 * 60_000, 60 * 60_000);
    expect(isMeetingNotEnded(e, NOON)).toBe(true);
  });

  it("is false when endMs <= now", () => {
    const e = eventAt(-2 * 60 * 60_000, -30 * 60_000);
    expect(isMeetingNotEnded(e, NOON)).toBe(false);
  });

  it("is false at exact end", () => {
    const e = eventAt(-60 * 60_000, 0);
    expect(isMeetingNotEnded(e, NOON)).toBe(false);
  });
});

describe("isCompletedTodayMeeting / filterCompletedTodayMeetings", () => {
  // Local calendar day around afternoon so prior/next day boundaries are clear.
  const localNow = new Date(2026, 6, 30, 15, 0, 0).getTime();

  it("includes same-local-day ended events", () => {
    const e = createMockEvent({
      id: asTestEventId("done"),
      startDate: new Date(2026, 6, 30, 10, 0, 0).toISOString(),
      endDate: new Date(2026, 6, 30, 11, 0, 0).toISOString(),
    });
    expect(isCompletedTodayMeeting(e, localNow)).toBe(true);
  });

  it("excludes in-progress and future events", () => {
    const live = createMockEvent({
      id: asTestEventId("live"),
      startDate: new Date(2026, 6, 30, 14, 0, 0).toISOString(),
      endDate: new Date(2026, 6, 30, 16, 0, 0).toISOString(),
    });
    const future = createMockEvent({
      id: asTestEventId("fut"),
      startDate: new Date(2026, 6, 30, 17, 0, 0).toISOString(),
      endDate: new Date(2026, 6, 30, 18, 0, 0).toISOString(),
    });
    expect(isCompletedTodayMeeting(live, localNow)).toBe(false);
    expect(isCompletedTodayMeeting(future, localNow)).toBe(false);
  });

  it("excludes overnight spanning and prior-day events", () => {
    const overnight = createMockEvent({
      id: asTestEventId("over"),
      startDate: new Date(2026, 6, 29, 22, 0, 0).toISOString(),
      endDate: new Date(2026, 6, 30, 1, 0, 0).toISOString(),
    });
    const prior = createMockEvent({
      id: asTestEventId("prior"),
      startDate: new Date(2026, 6, 29, 10, 0, 0).toISOString(),
      endDate: new Date(2026, 6, 29, 11, 0, 0).toISOString(),
    });
    expect(isCompletedTodayMeeting(overnight, localNow)).toBe(false);
    expect(isCompletedTodayMeeting(prior, localNow)).toBe(false);
  });

  it("sorts newest-ended first", () => {
    const early = createMockEvent({
      id: asTestEventId("early"),
      startDate: new Date(2026, 6, 30, 9, 0, 0).toISOString(),
      endDate: new Date(2026, 6, 30, 10, 0, 0).toISOString(),
    });
    const late = createMockEvent({
      id: asTestEventId("late"),
      startDate: new Date(2026, 6, 30, 12, 0, 0).toISOString(),
      endDate: new Date(2026, 6, 30, 13, 0, 0).toISOString(),
    });
    const result = filterCompletedTodayMeetings([early, late], localNow);
    expect(result.map((e) => e.id)).toEqual(["late", "early"]);
  });
});

describe("filterUpcomingMeetings", () => {
  it("drops ended events", () => {
    const past = eventAt(-3 * 60 * 60_000, -2 * 60 * 60_000, { id: asTestEventId("past") });
    const live = eventAt(-30 * 60_000, 60 * 60_000, { id: asTestEventId("live") });
    const future = eventAt(60 * 60_000, 2 * 60 * 60_000, { id: asTestEventId("future") });
    const result = filterUpcomingMeetings([past, live, future], NOON);
    expect(result.map((e) => e.id)).toEqual(["live", "future"]);
  });

  it("excludes all-day when option set", () => {
    const allDay = eventAt(0, 24 * 60 * 60_000, {
      id: asTestEventId("ad"),
      isAllDay: true,
    });
    const timed = eventAt(60 * 60_000, 2 * 60 * 60_000, { id: asTestEventId("t") });
    const result = filterUpcomingMeetings([allDay, timed], NOON, { excludeAllDay: true });
    expect(result.map((e) => e.id)).toEqual(["t"]);
  });

  it("keeps all-day by default when not ended", () => {
    const allDay = eventAt(0, 24 * 60 * 60_000, {
      id: asTestEventId("ad"),
      isAllDay: true,
    });
    const result = filterUpcomingMeetings([allDay], NOON);
    expect(result).toHaveLength(1);
  });
});

describe("nextDisplayHorizonMs", () => {
  it("returns end of in-progress meeting", () => {
    const e = eventAt(-30 * 60_000, 60 * 60_000);
    const endMs = new Date(e.endDate).getTime();
    expect(nextDisplayHorizonMs([e], NOON)).toBe(endMs);
  });

  it("returns soonest of start and end among future events (beyond 15 min)", () => {
    // Starts >15 min out so soft minute boundaries do not preempt start times.
    const a = eventAt(45 * 60_000, 90 * 60_000, { id: asTestEventId("a") });
    const b = eventAt(20 * 60_000, 50 * 60_000, { id: asTestEventId("b") });
    const startB = new Date(b.startDate).getTime();
    expect(nextDisplayHorizonMs([a, b], NOON)).toBe(startB);
  });

  it("ignores already-ended events", () => {
    const past = eventAt(-3 * 60 * 60_000, -60 * 60_000);
    expect(nextDisplayHorizonMs([past], NOON)).toBeNull();
  });

  it("returns null for empty list", () => {
    expect(nextDisplayHorizonMs([], NOON)).toBeNull();
  });

  it("includes next minute boundary when start is within 15 min", () => {
    // 5 minutes until start
    const e = eventAt(5 * 60_000, 65 * 60_000);
    const horizon = nextDisplayHorizonMs([e], NOON);
    // next whole minute after NOON (which is on a minute boundary → +60s)
    const nextMinute = NOON + 60_000;
    expect(horizon).toBe(nextMinute);
  });
});
