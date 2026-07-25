import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockOpenExternal } = vi.hoisted(() => ({
  mockOpenExternal: vi.fn(),
}));

vi.mock("electron", () => ({
  shell: { openExternal: mockOpenExternal },
}));

import { openSystemSettings } from "../../src/main/utils/system-settings.js";

describe("openSystemSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenExternal.mockResolvedValue(undefined);
  });

  it("opens first calendars pane candidate", async () => {
    await openSystemSettings("calendars");
    expect(mockOpenExternal).toHaveBeenCalledWith(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
    );
  });

  it("falls back to root when pane opens fail", async () => {
    mockOpenExternal
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValueOnce(undefined);
    await openSystemSettings("calendars");
    expect(mockOpenExternal).toHaveBeenLastCalledWith("x-apple.systempreferences:");
  });
});
