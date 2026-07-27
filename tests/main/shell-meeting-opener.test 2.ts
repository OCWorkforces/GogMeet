import { describe, it, expect, vi, beforeEach } from "vitest";

const { openExternal } = vi.hoisted(() => ({
  openExternal: vi.fn(),
}));

vi.mock("electron", () => ({
  shell: { openExternal },
}));

import { createShellMeetingOpener } from "../../src/main/infrastructure/electron/shell-meeting-opener.js";

describe("createShellMeetingOpener", () => {
  beforeEach(() => {
    openExternal.mockReset();
    openExternal.mockResolvedValue(undefined);
  });

  it("opens allowlisted Meet URL", async () => {
    const opener = createShellMeetingOpener();
    const result = await opener.open("https://meet.google.com/abc-defg-hij");
    expect(result).toEqual({ ok: true, value: undefined });
    expect(openExternal).toHaveBeenCalledWith("https://meet.google.com/abc-defg-hij");
  });

  it("blocks disallowed host", async () => {
    const opener = createShellMeetingOpener();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await opener.open("https://evil.example/room");
    expect(result.ok).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("returns error when shell.openExternal throws", async () => {
    openExternal.mockRejectedValue(new Error("no browser"));
    const opener = createShellMeetingOpener();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await opener.open("https://meet.google.com/abc-defg-hij");
    expect(result).toEqual({ ok: false, error: "no browser" });
    errSpy.mockRestore();
  });
});
