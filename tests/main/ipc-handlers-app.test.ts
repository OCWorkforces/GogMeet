import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockOpenMeetingUrl, mockJoinMeetingById } = vi.hoisted(() => ({
  mockOpenMeetingUrl: vi.fn(),
  mockJoinMeetingById: vi.fn(),
}));

vi.mock("../../src/main/utils/meet-url.js", () => ({
  openMeetingUrl: mockOpenMeetingUrl,
}));

vi.mock("../../src/main/utils/join-meeting.js", () => ({
  joinMeetingById: mockJoinMeetingById,
}));

import { registerAppHandlers } from "../../src/main/ipc-handlers/app.js";
import { ipcMain, app } from "electron";
import { authorizedInvokeEvent } from "../helpers/ipc-sender.js";

const mockIpcMain = vi.mocked(ipcMain);
const mockApp = vi.mocked(app);

function getRegisteredHandler(channel: string) {
  const call = mockIpcMain.handle.mock.calls.find((c) => c[0] === channel);
  return call?.[1];
}

const unauthorizedEvent = {
  senderFrame: { url: "https://evil.com/" },
} as unknown as import("electron").IpcMainInvokeEvent;

const authorizedEvent = authorizedInvokeEvent("index") as unknown as import("electron").IpcMainInvokeEvent;

describe("registerAppHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApp.getVersion.mockReturnValue("1.0.0");
    mockOpenMeetingUrl.mockResolvedValue({ ok: true, value: undefined });
    mockJoinMeetingById.mockResolvedValue({ ok: true, value: undefined });
  });

  it("registers 3 handlers", () => {
    registerAppHandlers();
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(3);
  });

  describe("app:open-external", () => {
    it("delegates allowed URL to openMeetingUrl for authorized sender", async () => {
      registerAppHandlers();
      const handler = getRegisteredHandler("app:open-external");

      const result = await handler!(authorizedEvent, {
        url: "https://meet.google.com/abc-def-ghi",
      });
      expect(mockOpenMeetingUrl).toHaveBeenCalledWith("https://meet.google.com/abc-def-ghi");
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it("returns err for invalid URL shape", async () => {
      registerAppHandlers();
      const handler = getRegisteredHandler("app:open-external");

      const result = await handler!(authorizedEvent, { url: "http://meet.google.com/abc" });
      expect(mockOpenMeetingUrl).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: false });
    });

    it("returns err for non-string URL", async () => {
      registerAppHandlers();
      const handler = getRegisteredHandler("app:open-external");

      const result = await handler!(authorizedEvent, { url: 123 });
      expect(mockOpenMeetingUrl).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, error: "Invalid URL payload" });
    });

    it("returns Unauthorized for unauthorized sender", async () => {
      registerAppHandlers();
      const handler = getRegisteredHandler("app:open-external");

      const result = await handler!(unauthorizedEvent, {
        url: "https://meet.google.com/abc-def-ghi",
      });
      expect(mockOpenMeetingUrl).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, error: "Unauthorized" });
    });
  });

  describe("app:join-meeting", () => {
    it("joins by event id for authorized sender", async () => {
      registerAppHandlers();
      const handler = getRegisteredHandler("app:join-meeting");

      const result = await handler!(authorizedEvent, { id: "evt-1" });
      expect(mockJoinMeetingById).toHaveBeenCalledWith("evt-1");
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it("returns Unauthorized for unauthorized sender", async () => {
      registerAppHandlers();
      const handler = getRegisteredHandler("app:join-meeting");

      const result = await handler!(unauthorizedEvent, { id: "evt-1" });
      expect(mockJoinMeetingById).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, error: "Unauthorized" });
    });

    it("returns err for empty id", async () => {
      registerAppHandlers();
      const handler = getRegisteredHandler("app:join-meeting");

      const result = await handler!(authorizedEvent, { id: "  " });
      expect(mockJoinMeetingById).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: false });
    });
  });

  describe("app:get-version", () => {
    it("returns version for authorized sender", async () => {
      mockApp.getVersion.mockReturnValue("1.6.1");
      registerAppHandlers();
      const handler = getRegisteredHandler("app:get-version");
      expect(await handler!(authorizedEvent)).toBe("1.6.1");
    });

    it("returns empty string for unauthorized sender", async () => {
      registerAppHandlers();
      const handler = getRegisteredHandler("app:get-version");
      expect(await handler!(unauthorizedEvent)).toBe("");
    });
  });
});
