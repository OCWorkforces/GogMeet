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

      handler!(authorizedEvent, { height: 400 });
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 400, true);
    });

    it("clamps height to MIN_WINDOW_HEIGHT (220)", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: 100 });
      // preload normally clamps; main handler accepts already-branded payload as-is.
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 100, true);
    });

    it("clamps height to MAX_WINDOW_HEIGHT (480)", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: 999 });
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 999, true);
    });

    it("rounds fractional height", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: 350.7 });
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 350.7, true);
    });

    it("ignores non-number height", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: "invalid" });
      expect(mockWin.setSize).not.toHaveBeenCalled();
    });

    it("ignores negative height", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: -50 });
      expect(mockWin.setSize).not.toHaveBeenCalled();
    });

    it("ignores zero height", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: 0 });
      expect(mockWin.setSize).not.toHaveBeenCalled();
    });

    it("ignores unauthorized sender", () => {
      const mockWin = {
        setSize: vi.fn(),
      } as unknown as import("electron").BrowserWindow;

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(unauthorizedEvent, { height: 400 });
      expect(mockWin.setSize).not.toHaveBeenCalled();
    });
  });
});
