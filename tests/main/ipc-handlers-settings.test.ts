import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for mock functions used in vi.mock factories
const {
  mockGetSettings,
  mockUpdateSettings,
  mockRestartScheduler,
  mockSyncAutoLaunch,
} = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockUpdateSettings: vi.fn(),
  mockRestartScheduler: vi.fn(),
  mockSyncAutoLaunch: vi.fn(),
}));

vi.mock("../../src/main/settings.js", () => ({
  getSettings: mockGetSettings,
  updateSettings: mockUpdateSettings,
}));
vi.mock("../../src/main/scheduler/index.js", () => ({
  restartScheduler: mockRestartScheduler,
}));
vi.mock("../../src/main/auto-launch.js", () => ({
  syncAutoLaunch: mockSyncAutoLaunch,
}));

import { registerSettingsHandlers } from "../../src/main/ipc-handlers/settings.js";
import { ipcMain } from "electron";
import { DEFAULT_SETTINGS } from "../../src/shared/settings.js";

const mockIpcMain = vi.mocked(ipcMain);

function getRegisteredHandler(channel: string) {
  const call = mockIpcMain.handle.mock.calls.find((c) => c[0] === channel);
  return call?.[1];
}

const authorizedEvent = {
  senderFrame: { url: "file:///app/index.html" },
} as unknown as import("electron").IpcMainInvokeEvent;

describe("registerSettingsHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockReturnValue(DEFAULT_SETTINGS);
    mockUpdateSettings.mockReturnValue(DEFAULT_SETTINGS);
  });

  it("registers 2 handlers", () => {
    const mockWin = {
      webContents: { send: vi.fn() },
    } as unknown as import("electron").BrowserWindow;

    registerSettingsHandlers(mockWin);
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(2);
  });

  describe("settings:get", () => {
    it("returns current settings for authorized sender", async () => {
      registerSettingsHandlers(
        {} as unknown as import("electron").BrowserWindow,
      );
      const handler = getRegisteredHandler("settings:get");

      const result = await handler!(authorizedEvent);
      expect(result).toEqual(DEFAULT_SETTINGS);
    });

    it("returns settings even for unauthorized sender", async () => {
      registerSettingsHandlers(
        {} as unknown as import("electron").BrowserWindow,
      );
      const handler = getRegisteredHandler("settings:get");

      const result = await handler!({
        senderFrame: { url: "https://evil.com/" },
      } as unknown as import("electron").IpcMainInvokeEvent);
      // Settings handler returns settings regardless (validateSender returns false but still returns getSettings())
      expect(mockGetSettings).toHaveBeenCalled();
    });
  });

  describe("settings:set", () => {
    it("updates settings and restarts scheduler", async () => {
      const updated = { ...DEFAULT_SETTINGS, openBeforeMinutes: 3 };
      mockUpdateSettings.mockReturnValue(updated);
      const mockWin = {
        webContents: { send: vi.fn() },
      } as unknown as import("electron").BrowserWindow;

      registerSettingsHandlers(mockWin);
      const handler = getRegisteredHandler("settings:set");

      const result = await handler!(authorizedEvent, { openBeforeMinutes: 3 });
      expect(mockUpdateSettings).toHaveBeenCalledWith({ openBeforeMinutes: 3 });
      expect(mockRestartScheduler).toHaveBeenCalledOnce();
      expect(result).toEqual(updated);
    });

    it("syncs auto-launch when launchAtLogin changes", async () => {
      const updated = { ...DEFAULT_SETTINGS, launchAtLogin: true };
      mockUpdateSettings.mockReturnValue(updated);
      const mockWin = {
        webContents: { send: vi.fn() },
      } as unknown as import("electron").BrowserWindow;

      registerSettingsHandlers(mockWin);
      const handler = getRegisteredHandler("settings:set");

      await handler!(authorizedEvent, { launchAtLogin: true });
      expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true);
    });

    it("does not sync auto-launch when launchAtLogin not changed", async () => {
      const mockWin = {
        webContents: { send: vi.fn() },
      } as unknown as import("electron").BrowserWindow;
      registerSettingsHandlers(mockWin);
      const handler = getRegisteredHandler("settings:set");

      await handler!(authorizedEvent, { openBeforeMinutes: 2 });
      expect(mockSyncAutoLaunch).not.toHaveBeenCalled();
    });

    it("sends settings:changed via webContents for display-affecting changes", async () => {
      const mockWin = {
        webContents: { send: vi.fn() },
      } as unknown as import("electron").BrowserWindow;
      const updated = { ...DEFAULT_SETTINGS, showTomorrowMeetings: false };
      mockUpdateSettings.mockReturnValue(updated);

      registerSettingsHandlers(mockWin);
      const handler = getRegisteredHandler("settings:set");

      await handler!(authorizedEvent, { showTomorrowMeetings: false });
      expect(mockWin.webContents.send).toHaveBeenCalledWith(
        "settings:changed",
        updated,
      );
    });

    it("returns settings for unauthorized sender", async () => {
      const mockWin = {
        webContents: { send: vi.fn() },
      } as unknown as import("electron").BrowserWindow;
      registerSettingsHandlers(mockWin);
      const handler = getRegisteredHandler("settings:set");

      const result = await handler!(
        {
          senderFrame: { url: "https://evil.com/" },
        } as unknown as import("electron").IpcMainInvokeEvent,
        { openBeforeMinutes: 2 },
      );
      expect(mockUpdateSettings).not.toHaveBeenCalled();
      expect(result).toEqual(DEFAULT_SETTINGS);
  });
});

});
