import { describe, it, expect, vi, beforeEach } from "vitest";

import { registerWindowHandlers } from "../../src/main/ipc-handlers/window.js";
import { ipcMain } from "electron";
import { authorizedInvokeEvent } from "../helpers/ipc-sender.js";

const mockIpcMain = vi.mocked(ipcMain);

function getRegisteredHandler(channel: string) {
  const call = mockIpcMain.on.mock.calls.find((c) => c[0] === channel);
  return call?.[1];
}

const unauthorizedEvent = {
  senderFrame: { url: "https://evil.com/" },
}.As<import("electron").IpcMainEvent>();

const authorizedEvent = authorizedInvokeEvent("index").As<import("electron").IpcMainInvokeEvent>();

describe("registerWindowHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers 1 handler via ipcMain.on", () => {
    const mockWin = {
      setSize: vi.fn(),
    }.As<import("electron").BrowserWindow>();

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
      }.As<import("electron").BrowserWindow>();

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: 400 });
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 400, true);
    });

    it("clamps below-minimum height to MIN_WINDOW_HEIGHT (220)", () => {
      const mockWin = {
        setSize: vi.fn(),
      }.As<import("electron").BrowserWindow>();

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: 100 });
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 220, true);
    });

    it("clamps above-maximum height to MAX_WINDOW_HEIGHT (480)", () => {
      const mockWin = {
        setSize: vi.fn(),
      }.As<import("electron").BrowserWindow>();

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: 999 });
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 480, true);
    });

    it("rounds fractional height", () => {
      const mockWin = {
        setSize: vi.fn(),
      }.As<import("electron").BrowserWindow>();

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: 350.7 });
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 351, true);
    });

    it("ignores non-number height", () => {
      const mockWin = {
        setSize: vi.fn(),
      }.As<import("electron").BrowserWindow>();

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: "invalid" });
      expect(mockWin.setSize).not.toHaveBeenCalled();
    });

    it("clamps negative height to MIN_WINDOW_HEIGHT", () => {
      const mockWin = {
        setSize: vi.fn(),
      }.As<import("electron").BrowserWindow>();

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: -50 });
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 220, true);
    });

    it("clamps zero height to MIN_WINDOW_HEIGHT", () => {
      const mockWin = {
        setSize: vi.fn(),
      }.As<import("electron").BrowserWindow>();

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(authorizedEvent, { height: 0 });
      expect(mockWin.setSize).toHaveBeenCalledWith(360, 220, true);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      "ignores non-finite height: %s",
      (height) => {
        const mockWin = {
          setSize: vi.fn(),
        }.As<import("electron").BrowserWindow>();

        registerWindowHandlers(mockWin);
        const handler = getRegisteredHandler("window:set-height");

        handler!(authorizedEvent, { height });
        expect(mockWin.setSize).not.toHaveBeenCalled();
      },
    );

    it("ignores unauthorized sender", () => {
      const mockWin = {
        setSize: vi.fn(),
      }.As<import("electron").BrowserWindow>();

      registerWindowHandlers(mockWin);
      const handler = getRegisteredHandler("window:set-height");

      handler!(unauthorizedEvent, { height: 400 });
      expect(mockWin.setSize).not.toHaveBeenCalled();
    });
  });
});
