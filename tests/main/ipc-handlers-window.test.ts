import { describe, it, expect, vi, beforeEach } from "vitest";

import { registerWindowHandlers } from "../../src/main/ipc-handlers/window.js";
import { ipcMain } from "electron";

const mockIpcMain = vi.mocked(ipcMain);

function getRegisteredHandler(channel: string) {
  const call = mockIpcMain.on.mock.calls.find((c) => c[0] === channel);
  return call?.[1];
}

const authorizedEvent = {
  senderFrame: { url: "file:///path/to/lib/renderer/main.html" },
} as unknown as import("electron").IpcMainEvent;

const unauthorizedEvent = {
  senderFrame: { url: "https://evil.com/" },
} as unknown as import("electron").IpcMainEvent;

describe("registerWindowHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers 1 handler via ipcMain.on", () => {
    const mockWin = {
      setSize: vi.fn(),
    } as unknown as import("electron").BrowserWindow;

    registerWindowHandlers(mockWin);
    expect(mockIpcMain.on).toHaveBeenCalledTimes(1);
    expect(mockIpcMain.on).toHaveBeenCalledWith(
      "window:set-height",
      expect.any(Function),
    );
  });

  describe("window:set-height", () => {
    it("sets window size with clamped height", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, 400);
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 400, true);
    });

    it("clamps height to MIN_WINDOW_HEIGHT (220)", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, 100);
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 220, true);
    });

    it("clamps height to MAX_WINDOW_HEIGHT (480)", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, 999);
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 480, true);
    });

    it("rounds fractional height", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, 350.7);
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 351, true);
    });

    it("ignores non-number height", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, "invalid");
      expect(mockWin.setSize).not.toHaveBeenCalled();
    });

    it("ignores negative height", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, -50);
      expect(mockWin.setSize).not.toHaveBeenCalled();
    });

    it("ignores zero height", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, 0);
      expect(mockWin.setSize).not.toHaveBeenCalled();
    });

    it("ignores unauthorized sender", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(unauthorizedEvent, 400);
      expect(mockWin.setSize).not.toHaveBeenCalled();
    });
  });
});
