import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for mock functions used in vi.mock factories
const { mockIsAllowedMeetUrl } = vi.hoisted(() => ({
  mockIsAllowedMeetUrl: vi.fn(),
}));

vi.mock("../../src/main/utils/url-validation.js", () => ({
  isAllowedMeetUrl: mockIsAllowedMeetUrl,
}));

import { registerAppHandlers } from "../../src/main/ipc-handlers/app.js";
import { ipcMain, shell, app } from "electron";

const mockIpcMain = vi.mocked(ipcMain);
const mockShell = vi.mocked(shell);
const mockApp = vi.mocked(app);

function getRegisteredHandler(channel: string) {
  const call = mockIpcMain.handle.mock.calls.find((c) => c[0] === channel);
  return call?.[1];
}

const authorizedEvent = {
  senderFrame: { url: "file:///path/to/lib/renderer/main.html" },
} as unknown as import("electron").IpcMainInvokeEvent;

const unauthorizedEvent = {
  senderFrame: { url: "https://evil.com/" },
} as unknown as import("electron").IpcMainInvokeEvent;

describe("registerAppHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApp.getVersion.mockReturnValue("1.0.0");
  });

  it("registers 2 handlers", () => {
    registerAppHandlers();
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(2);
  });

  describe("app:open-external", () => {
    it("opens allowed URL for authorized sender", async () => {
      mockIsAllowedMeetUrl.mockReturnValue(true);
      mockShell.openExternal.mockResolvedValue(undefined);

      registerAppHandlers();
      const handler = getRegisteredHandler("app:open-external");

      await handler!(authorizedEvent, "https://meet.google.com/abc-def-ghi");
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        "https://meet.google.com/abc-def-ghi",
      );
    });

    it("does not open non-allowed URL", async () => {
      mockIsAllowedMeetUrl.mockReturnValue(false);

      registerAppHandlers();
      const handler = getRegisteredHandler("app:open-external");

      await handler!(authorizedEvent, "https://evil.com/");
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("does nothing for non-string URL", async () => {
      registerAppHandlers();
      const handler = getRegisteredHandler("app:open-external");

      await handler!(authorizedEvent, 123);
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("does nothing for unauthorized sender", async () => {
      registerAppHandlers();
      const handler = getRegisteredHandler("app:open-external");

      await handler!(unauthorizedEvent, "https://meet.google.com/abc");
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("catches and logs errors", async () => {
      mockIsAllowedMeetUrl.mockReturnValue(true);
      mockShell.openExternal.mockRejectedValue(new Error("Network error"));

      registerAppHandlers();
      const handler = getRegisteredHandler("app:open-external");

      // Should not throw
      await expect(
        handler!(authorizedEvent, "https://meet.google.com/abc"),
      ).resolves.toBeUndefined();
    });
  });

  describe("app:get-version", () => {
    it("returns version for authorized sender", async () => {
      mockApp.getVersion.mockReturnValue("1.6.1");

      registerAppHandlers();
      const handler = getRegisteredHandler("app:get-version");

      const result = await handler!(authorizedEvent);
      expect(result).toBe("1.6.1");
    });

    it("returns empty string for unauthorized sender", async () => {
      registerAppHandlers();
      const handler = getRegisteredHandler("app:get-version");

      const result = await handler!(unauthorizedEvent);
      expect(result).toBe("");
    });

    it("returns empty string on error", async () => {
      mockApp.getVersion.mockImplementation(() => {
        throw new Error("fail");
      });

      registerAppHandlers();
      const handler = getRegisteredHandler("app:get-version");

      const result = await handler!(authorizedEvent);
      expect(result).toBe("");
    });
  });
});
