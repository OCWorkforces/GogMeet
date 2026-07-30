import { describe, it, expect, vi, beforeEach } from "vitest";
import { asTestEventId, asTestMeetUrl, createMockEvent } from "../helpers/test-utils.js";

const {
  mockGetLastKnownEvents,
  mockGetCalendarEventsResult,
  mockCancelPendingBrowserOpen,
  mockBuildMeetUrl,
  mockOpenMeetingUrl,
} = vi.hoisted(() => ({
  mockGetLastKnownEvents: vi.fn(),
  mockGetCalendarEventsResult: vi.fn(),
  mockCancelPendingBrowserOpen: vi.fn(),
  mockBuildMeetUrl: vi.fn(),
  mockOpenMeetingUrl: vi.fn(),
}));

vi.mock("../../src/main/scheduler/facade.js", () => ({
  getLastKnownEvents: mockGetLastKnownEvents,
  cancelPendingBrowserOpen: mockCancelPendingBrowserOpen,
}));

vi.mock("../../src/main/facades/calendar.js", () => ({
  getCalendarEventsResult: mockGetCalendarEventsResult,
}));

vi.mock("../../src/domain/services/build-meet-url.js", () => ({
  buildMeetUrl: mockBuildMeetUrl,
}));

vi.mock("../../src/main/utils/meet-url.js", () => ({
  openMeetingUrl: mockOpenMeetingUrl,
}));

import { joinMeetingById } from "../../src/main/utils/join-meeting.js";

describe("joinMeetingById", () => {
  const event = createMockEvent({
    id: asTestEventId("evt-1"),
    meetUrl: asTestMeetUrl("https://meet.google.com/abc-def-ghi"),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildMeetUrl.mockReturnValue(
      "https://meet.google.com/abc-def-ghi?authuser=user%40example.com",
    );
    mockOpenMeetingUrl.mockResolvedValue({ ok: true, value: undefined });
  });

  it("opens from cache and marks opened", async () => {
    mockGetLastKnownEvents.mockReturnValue({ kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [event] });

    const result = await joinMeetingById(event.id);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(mockGetCalendarEventsResult).not.toHaveBeenCalled();
    expect(mockOpenMeetingUrl).toHaveBeenCalledOnce();
    expect(mockCancelPendingBrowserOpen).toHaveBeenCalledWith(event.id);
  });

  it("fallback-fetches when id missing from ok cache", async () => {
    mockGetLastKnownEvents.mockReturnValue({ kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] });
    mockGetCalendarEventsResult.mockResolvedValue({ kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [event] });

    const result = await joinMeetingById(event.id);

    expect(result.ok).toBe(true);
    expect(mockGetCalendarEventsResult).toHaveBeenCalledOnce();
    expect(mockCancelPendingBrowserOpen).toHaveBeenCalledWith(event.id);
  });

  it("returns err and does not mark opened when open fails", async () => {
    mockGetLastKnownEvents.mockReturnValue({ kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [event] });
    mockOpenMeetingUrl.mockResolvedValue({ ok: false, error: "blocked" });

    const result = await joinMeetingById(event.id);

    expect(result).toEqual({ ok: false, error: "blocked" });
    expect(mockCancelPendingBrowserOpen).not.toHaveBeenCalled();
  });

  it("returns calendar error code path message when fetch fails", async () => {
    mockGetLastKnownEvents.mockReturnValue(null);
    mockGetCalendarEventsResult.mockResolvedValue({
      kind: "err",
      error: "denied",
      code: "permission-denied",
    });

    const result = await joinMeetingById(event.id);
    expect(result).toEqual({ ok: false, error: "denied" });
  });
});
