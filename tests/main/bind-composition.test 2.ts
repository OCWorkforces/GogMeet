import { describe, it, expect, vi } from "vitest";

const { rebindCalendarDefaults, rebindSettingsDefaults, rebindJoinMeetingDefaults } = vi.hoisted(
  () => ({
    rebindCalendarDefaults: vi.fn(),
    rebindSettingsDefaults: vi.fn(),
    rebindJoinMeetingDefaults: vi.fn(),
  }),
);

vi.mock("../../src/main/facades/calendar.js", () => ({ rebindCalendarDefaults }));
vi.mock("../../src/main/facades/settings.js", () => ({ rebindSettingsDefaults }));
vi.mock("../../src/main/utils/join-meeting.js", () => ({ rebindJoinMeetingDefaults }));

import { bindComposition } from "../../src/main/composition/bind-composition.js";

describe("bindComposition", () => {
  it("rebinds calendar, settings, and join defaults", () => {
    rebindCalendarDefaults.mockClear();
    rebindSettingsDefaults.mockClear();
    rebindJoinMeetingDefaults.mockClear();
    const result = bindComposition();
    expect(result).toEqual({ bound: true });
    expect(rebindCalendarDefaults).toHaveBeenCalledOnce();
    expect(rebindSettingsDefaults).toHaveBeenCalledOnce();
    expect(rebindJoinMeetingDefaults).toHaveBeenCalledOnce();
  });
});
