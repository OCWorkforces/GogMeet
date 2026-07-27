import { describe, it, expect, vi, beforeEach } from "vitest";
import { asTestEventId, asTestMeetUrl, createMockEvent } from "../helpers/test-utils.js";
import { createJoinMeeting } from "../../src/main/application/use-cases/join-meeting.js";
import type { CalendarResult } from "../../src/domain/entities/calendar-result.js";

describe("createJoinMeeting", () => {
  const event = createMockEvent({
    id: asTestEventId("evt-1"),
    meetUrl: asTestMeetUrl("https://meet.google.com/abc-def-ghi"),
    userEmail: "user@test.com",
  });

  const okCalendar: CalendarResult = { kind: "ok", events: [event] };

  let getLastKnown: ReturnType<typeof vi.fn>;
  let fetchCalendar: ReturnType<typeof vi.fn>;
  let open: ReturnType<typeof vi.fn>;
  let cancelPending: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getLastKnown = vi.fn().mockReturnValue(okCalendar);
    fetchCalendar = vi.fn();
    open = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    cancelPending = vi.fn();
  });

  function create() {
    return createJoinMeeting({
      getLastKnownEvents: getLastKnown,
      fetchCalendarEvents: fetchCalendar,
      opener: { open },
      cancelPendingBrowserOpen: cancelPending,
    });
  }

  it("opens from last-known events and cancels pending auto-open", async () => {
    const join = create();
    const result = await join.execute(event.id);
    expect(result).toEqual({ ok: true, value: undefined });
    expect(fetchCalendar).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledOnce();
    expect(String(open.mock.calls[0]?.[0])).toContain("meet.google.com");
    expect(cancelPending).toHaveBeenCalledWith(event.id);
  });

  it("fetches when cache misses then opens", async () => {
    getLastKnown.mockReturnValue({ kind: "ok", events: [] });
    fetchCalendar.mockResolvedValue(okCalendar);
    const join = create();
    const result = await join.execute(event.id);
    expect(result.ok).toBe(true);
    expect(fetchCalendar).toHaveBeenCalledOnce();
    expect(cancelPending).toHaveBeenCalledWith(event.id);
  });

  it("does not cancel pending when open fails", async () => {
    open.mockResolvedValue({ ok: false, error: "blocked" });
    const join = create();
    const result = await join.execute(event.id);
    expect(result).toEqual({ ok: false, error: "blocked" });
    expect(cancelPending).not.toHaveBeenCalled();
  });

  it("returns error when meeting not found", async () => {
    getLastKnown.mockReturnValue({ kind: "ok", events: [] });
    fetchCalendar.mockResolvedValue({ kind: "ok", events: [] });
    const join = create();
    const result = await join.execute(event.id);
    expect(result).toEqual({ ok: false, error: "Meeting not found" });
  });

  it("returns calendar error when last-known is err and fetch fails", async () => {
    getLastKnown.mockReturnValue({
      kind: "err",
      error: "no access",
      code: "permission-denied",
    });
    fetchCalendar.mockResolvedValue({
      kind: "err",
      error: "still no",
      code: "permission-denied",
    });
    const join = create();
    const result = await join.execute(event.id);
    expect(result).toEqual({ ok: false, error: "still no" });
  });

  it("returns error when event has no meetUrl after fetch", async () => {
    const bare = createMockEvent({ meetUrl: undefined });
    getLastKnown.mockReturnValue({ kind: "ok", events: [bare] });
    fetchCalendar.mockResolvedValue({ kind: "ok", events: [bare] });
    const join = create();
    const result = await join.execute(bare.id);
    expect(result).toEqual({ ok: false, error: "No joinable meeting URL" });
  });

  it("returns not found when cache null and fetch empty", async () => {
    getLastKnown.mockReturnValue(null);
    fetchCalendar.mockResolvedValue({ kind: "ok", events: [] });
    const join = create();
    const result = await join.execute(asTestEventId("missing"));
    expect(result.ok).toBe(false);
  });
});
