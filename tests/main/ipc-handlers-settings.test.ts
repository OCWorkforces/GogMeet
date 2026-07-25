import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for mock functions used in vi.mock factories
const {
  mockGetSettings,
  mockUpdateSettings,
  mockRestartScheduler,
  mockForcePoll,
  mockSyncAutoLaunch,
} = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockUpdateSettings: vi.fn(),
  mockRestartScheduler: vi.fn(),
  mockForcePoll: vi.fn(),
  mockSyncAutoLaunch: vi.fn(),
}));

vi.mock("../../src/main/domain/settings.js", () => ({
  getSettings: mockGetSettings,
  updateSettings: mockUpdateSettings,
}));
vi.mock("../../src/main/scheduler/facade.js", () => ({
  restartScheduler: mockRestartScheduler,
  forcePoll: mockForcePoll,
}));
vi.mock("../../src/main/system/auto-launch.js", () => ({
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
  senderFrame: { url: "file:///app/lib/renderer/index.html" },
} as unknown as import("electron").IpcMainInvokeEvent;

describe("registerSettingsHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockReturnValue(DEFAULT_SETTINGS);
    mockUpdateSettings.mockResolvedValue(DEFAULT_SETTINGS);
  });

  it("registers 2 handlers", () => {
    const mockWin = {
      webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
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

    it("returns fresh DEFAULT_SETTINGS without calling getSettings for unauthorized sender", async () => {
      registerSettingsHandlers(
        {} as unknown as import("electron").BrowserWindow,
      );
      const handler = getRegisteredHandler("settings:get");

      const result = await handler!({
        senderFrame: { url: "https://evil.com/" },
      } as unknown as import("electron").IpcMainInvokeEvent);
      expect(mockGetSettings).not.toHaveBeenCalled();
      expect(result).toEqual(DEFAULT_SETTINGS);
      expect(result).not.toBe(DEFAULT_SETTINGS);
    });
  });

  describe("settings:set", () => {
    it("updates settings and restarts scheduler", async () => {
      const updated = { ...DEFAULT_SETTINGS, openBeforeMinutes: 3 };
      mockUpdateSettings.mockResolvedValue(updated);
      const mockWin = {
        webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
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
      mockUpdateSettings.mockResolvedValue(updated);
      const mockWin = {
        webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
      } as unknown as import("electron").BrowserWindow;

      registerSettingsHandlers(mockWin);
      const handler = getRegisteredHandler("settings:set");

      await handler!(authorizedEvent, { launchAtLogin: true });
      expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true);
    });

    it("does not sync auto-launch when launchAtLogin not changed", async () => {
      const mockWin = {
        webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
      } as unknown as import("electron").BrowserWindow;
      registerSettingsHandlers(mockWin);
      const handler = getRegisteredHandler("settings:set");

      await handler!(authorizedEvent, { openBeforeMinutes: 2 });
      expect(mockSyncAutoLaunch).not.toHaveBeenCalled();
    });

    it("sends settings:changed via webContents for display-affecting changes", async () => {
      const mockWin = {
        webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
      } as unknown as import("electron").BrowserWindow;
      const updated = { ...DEFAULT_SETTINGS, showTomorrowMeetings: false };
      mockUpdateSettings.mockResolvedValue(updated);

      registerSettingsHandlers(mockWin);
      const handler = getRegisteredHandler("settings:set");

      await handler!(authorizedEvent, { showTomorrowMeetings: false });
      expect(mockWin.webContents.send).toHaveBeenCalledWith(
        "settings:changed",
        updated,
      );
    });

    it("returns fresh DEFAULT_SETTINGS and performs no side effects for unauthorized sender", async () => {
      const mockWin = {
        webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
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
      expect(mockRestartScheduler).not.toHaveBeenCalled();
      expect(mockSyncAutoLaunch).not.toHaveBeenCalled();
      expect(mockWin.webContents.send).not.toHaveBeenCalled();
      expect(mockGetSettings).not.toHaveBeenCalled();
      expect(result).toEqual(DEFAULT_SETTINGS);
      expect(result).not.toBe(DEFAULT_SETTINGS);
    });

    it("does not restart scheduler when only launchAtLogin changes", async () => {
      const updated = { ...DEFAULT_SETTINGS, launchAtLogin: true };
      mockUpdateSettings.mockResolvedValue(updated);
      const mockWin = {
        webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
      } as unknown as import("electron").BrowserWindow;

      registerSettingsHandlers(mockWin);
      const handler = getRegisteredHandler("settings:set");

      await handler!(authorizedEvent, { launchAtLogin: true });
      expect(mockRestartScheduler).not.toHaveBeenCalled();
      expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true);
      expect(mockWin.webContents.send).toHaveBeenCalledWith("settings:changed", updated);
    });

    it("force-polls (no restart) when only showTomorrowMeetings changes", async () => {
      const updated = { ...DEFAULT_SETTINGS, showTomorrowMeetings: false };
      mockUpdateSettings.mockResolvedValue(updated);
      const mockWin = {
        webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
      } as unknown as import("electron").BrowserWindow;

      registerSettingsHandlers(mockWin);
      const handler = getRegisteredHandler("settings:set");

      await handler!(authorizedEvent, { showTomorrowMeetings: false });
      expect(mockRestartScheduler).not.toHaveBeenCalled();
      expect(mockForcePoll).toHaveBeenCalledOnce();
    });

    it("restarts scheduler for quiet hours and auto-open timing keys", async () => {
      const mockWin = {
        webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
      } as unknown as import("electron").BrowserWindow;
      mockUpdateSettings.mockResolvedValue(DEFAULT_SETTINGS);
      registerSettingsHandlers(mockWin);
      const handler = getRegisteredHandler("settings:set");

      await handler!(authorizedEvent, { quietHoursEnabled: true });
      expect(mockRestartScheduler).toHaveBeenCalledOnce();
      mockRestartScheduler.mockClear();

      await handler!(authorizedEvent, { autoOpenEnabled: false });
      expect(mockRestartScheduler).toHaveBeenCalledOnce();
    });
  });
});
