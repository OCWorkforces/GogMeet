import { describe, it, expect, vi, beforeEach } from "vitest";
import { asTestEventId } from "../helpers/test-utils.js";

vi.mock("../../src/main/facades/calendar.js", () => ({
  getCalendarEventsResult: vi.fn().mockResolvedValue({ kind: "ok", events: [] }),
}));
vi.mock("../../src/main/scheduler/facade.js", () => ({
  getLastKnownEvents: vi.fn().mockReturnValue(null),
  cancelPendingBrowserOpen: vi.fn(),
}));
vi.mock("../../src/main/utils/meet-url.js", () => ({
  openMeetingUrl: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}));

describe("join-meeting free function bind", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("bindJoinMeeting overrides and rebind restores default", async () => {
    const mod = await import("../../src/main/utils/join-meeting.js");
    const custom = {
      execute: vi.fn().mockResolvedValue({ ok: false, error: "custom" }),
    };
    mod.bindJoinMeeting(custom);
    const id = asTestEventId("evt-custom");
    const result = await mod.joinMeetingById(id);
    expect(result).toEqual({ ok: false, error: "custom" });
    expect(custom.execute).toHaveBeenCalledWith(id);

    mod.rebindJoinMeetingDefaults();
    const result2 = await mod.joinMeetingById(id);
    // default path: no events → meeting not found or no calendar data
    expect(result2.ok).toBe(false);
  });
});
