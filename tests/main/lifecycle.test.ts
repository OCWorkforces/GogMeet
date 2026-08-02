import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSettings } from "../helpers/test-utils.js";

// Use vi.hoisted for mock functions used in vi.mock factories
const {
  mockRegisterIpcHandlers,
  mockSetupTray,
  mockUpdateTrayTitle,
  mockStartScheduler,
  mockStopScheduler,
  mockRestartScheduler,
  mockSetSchedulerWindow,
  mockSetTrayTitleCallback,
  mockGetSettings,
  mockLoadSettings,
  mockSyncAutoLaunch,
  mockCheckNotificationPermission,
  mockRegisterShortcuts,
  mockUnregisterShortcuts,
  mockInitPowerManagement,
  mockCleanupPowerManagement,
  mockGetPollInterval,
  mockPreventSleep,
  mockAllowSleep,
  mockGetCalendarPermissionStatus,
  mockRequestCalendarPermission,
  mockGetCalendarEventsResult,
  mockInvalidateCalendarPermissionCache,
  mockInitPowerCallbacks,
  mockWarmupCalendarProvider,
  mockShouldAutoRequestCalendarPermission,
  mockStartCalendarWatcher,
  mockStopCalendarWatcher,
  mockInitAutoUpdater,
  mockReviveCalendarWatcher,
} = vi.hoisted(() => ({
  mockRegisterIpcHandlers: vi.fn(),
  mockSetupTray: vi.fn(),
  mockUpdateTrayTitle: vi.fn(),
  mockStartScheduler: vi.fn(),
  mockStopScheduler: vi.fn(),
  mockRestartScheduler: vi.fn(),
  mockSetSchedulerWindow: vi.fn(),
  mockSetTrayTitleCallback: vi.fn(),
  mockGetSettings: vi.fn().mockReturnValue({
    schemaVersion: 1,
    openBeforeMinutes: 1,
    launchAtLogin: false,
    showTomorrowMeetings: true,
    windowAlert: true,
  }),
  mockLoadSettings: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  mockSyncAutoLaunch: vi.fn(),
  mockCheckNotificationPermission: vi.fn().mockResolvedValue(undefined),
  mockRegisterShortcuts: vi.fn(),
  mockUnregisterShortcuts: vi.fn(),
  mockInitPowerManagement: vi.fn(),
  mockCleanupPowerManagement: vi.fn(),
  mockGetPollInterval: vi.fn().mockReturnValue(120000),
  mockPreventSleep: vi.fn(),
  mockAllowSleep: vi.fn(),
  mockGetCalendarPermissionStatus: vi.fn().mockResolvedValue("granted"),
  mockRequestCalendarPermission: vi.fn().mockResolvedValue("granted"),
  mockGetCalendarEventsResult: vi.fn().mockResolvedValue({ kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] }),
  mockInvalidateCalendarPermissionCache: vi.fn(),
  mockInitPowerCallbacks: vi.fn(),
  mockWarmupCalendarProvider: vi.fn().mockResolvedValue(undefined),
  mockShouldAutoRequestCalendarPermission: vi.fn().mockReturnValue(true),
  mockStartCalendarWatcher: vi.fn(),
  mockStopCalendarWatcher: vi.fn(),
  mockInitAutoUpdater: vi.fn(),
  mockReviveCalendarWatcher: vi.fn(),
}));

// Mock all subsystem modules that lifecycle.ts imports
vi.mock("../../src/main/app/ipc.js", () => ({
  registerIpcHandlers: mockRegisterIpcHandlers,
}));

vi.mock("../../src/main/tray.js", () => ({
  setupTray: mockSetupTray,
  updateTrayTitle: mockUpdateTrayTitle,
}));

vi.mock("../../src/main/facades/settings.js", () => ({
  getSettings: mockGetSettings,
  loadSettings: mockLoadSettings,
}));

vi.mock("../../src/main/system/auto-launch.js", () => ({
  syncAutoLaunch: mockSyncAutoLaunch,
}));

vi.mock("../../src/main/system/notification.js", () => ({
  checkNotificationPermission: mockCheckNotificationPermission,
}));

vi.mock("../../src/main/system/shortcuts.js", () => ({
  registerShortcuts: mockRegisterShortcuts,
  unregisterShortcuts: mockUnregisterShortcuts,
}));

vi.mock("../../src/main/system/power.js", () => ({
  initPowerManagement: mockInitPowerManagement,
  cleanupPowerManagement: mockCleanupPowerManagement,
  getPollInterval: mockGetPollInterval,
  preventSleep: mockPreventSleep,
  allowSleep: mockAllowSleep,
}));

vi.mock("../../src/main/facades/calendar.js", () => ({
  getCalendarPermissionStatus: mockGetCalendarPermissionStatus,
  requestCalendarPermission: mockRequestCalendarPermission,
  getCalendarEventsResult: mockGetCalendarEventsResult,
  invalidateCalendarPermissionCache: mockInvalidateCalendarPermissionCache,
  warmupCalendarProvider: mockWarmupCalendarProvider,
  shouldAutoRequestCalendarPermission: mockShouldAutoRequestCalendarPermission,
}));

vi.mock("../../src/main/facades/calendar-watcher.js", () => ({
  startCalendarWatcher: mockStartCalendarWatcher,
  stopCalendarWatcher: mockStopCalendarWatcher,
  reviveCalendarWatcher: mockReviveCalendarWatcher,
}));

vi.mock("../../src/main/system/auto-updater.js", () => ({
  initAutoUpdater: mockInitAutoUpdater,
}));

const {
  mockDestroyAlertWindow,
  mockDestroySettingsWindow,
  mockDestroyAboutWindow,
} = vi.hoisted(() => ({
  mockDestroyAlertWindow: vi.fn(),
  mockDestroySettingsWindow: vi.fn(),
  mockDestroyAboutWindow: vi.fn(),
}));

vi.mock("../../src/main/windows/alert-window.js", () => ({
  destroyAlertWindow: (...args: unknown[]) => mockDestroyAlertWindow(...args),
}));

vi.mock("../../src/main/windows/settings-window.js", () => ({
  destroySettingsWindow: (...args: unknown[]) => mockDestroySettingsWindow(...args),
  getSettingsWindow: vi.fn().mockReturnValue(null),
}));

vi.mock("../../src/main/windows/about-window.js", () => ({
  destroyAboutWindow: (...args: unknown[]) => mockDestroyAboutWindow(...args),
}));

vi.mock("../../src/main/composition/app-graph.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/main/composition/app-graph.js")>();
  return {
    ...mod,
    createAppGraph: (opts?: Parameters<typeof mod.createAppGraph>[0]) =>
      mod.createAppGraph({ skipBind: true, ...opts }),
  };
});

vi.mock("../../src/main/scheduler/facade.js", () => ({
  initPowerCallbacks: mockInitPowerCallbacks,
  startScheduler: mockStartScheduler,
  stopScheduler: mockStopScheduler,
  restartScheduler: mockRestartScheduler,
  setSchedulerWindow: mockSetSchedulerWindow,
  setTrayTitleCallback: mockSetTrayTitleCallback,
}));

import { initializeApp, shutdownApp } from "../../src/main/app/lifecycle.js";

const mockWindow = {}.As<import("electron").BrowserWindow>();

describe("lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initializeApp", () => {
    it("calls all subsystem init functions", async () => {
      await initializeApp(mockWindow);

      // IPC handlers registered with main window
      expect(mockRegisterIpcHandlers).toHaveBeenCalledWith(mockWindow, expect.any(Object));

      // Tray set up with main window
      expect(mockSetupTray).toHaveBeenCalledWith(mockWindow, expect.any(Object));

      // Scheduler receives tray callback and window reference
      expect(mockSetTrayTitleCallback).toHaveBeenCalledWith(
        mockUpdateTrayTitle,
      );
      expect(mockSetSchedulerWindow).toHaveBeenCalledWith(mockWindow);

      // Calendar permission checked before scheduler starts
      expect(mockGetCalendarPermissionStatus).toHaveBeenCalledOnce();

      // Scheduler started
      expect(mockStartScheduler).toHaveBeenCalledOnce();

      // Power management initialized with restartScheduler callback
      expect(mockInitPowerManagement).toHaveBeenCalledOnce();
      expect(mockInitPowerManagement).toHaveBeenCalledWith(expect.any(Function));

      // Shortcuts registered
      expect(mockRegisterShortcuts).toHaveBeenCalledOnce();

      // Notification permission checked
      expect(mockCheckNotificationPermission).toHaveBeenCalledOnce();

      // Auto-launch synced with settings
      expect(mockSyncAutoLaunch).toHaveBeenCalledWith(false);

      // Auto-updater wired for packaged installs
      expect(mockInitAutoUpdater).toHaveBeenCalledOnce();
    });

    it("requests calendar permission when not determined and auto-request is allowed", async () => {
      mockGetCalendarPermissionStatus.mockResolvedValueOnce("not-determined");
      mockShouldAutoRequestCalendarPermission.mockReturnValueOnce(true);

      await initializeApp(mockWindow);

      expect(mockGetCalendarPermissionStatus).toHaveBeenCalledOnce();
      expect(mockRequestCalendarPermission).toHaveBeenCalledOnce();
      // Scheduler should still start after permission request
      expect(mockStartScheduler).toHaveBeenCalledOnce();
    });

    it("skips auto permission request when shouldAutoRequest is false (Windows)", async () => {
      mockGetCalendarPermissionStatus.mockResolvedValueOnce("not-determined");
      mockShouldAutoRequestCalendarPermission.mockReturnValueOnce(false);

      await initializeApp(mockWindow);

      expect(mockGetCalendarPermissionStatus).toHaveBeenCalledOnce();
      expect(mockRequestCalendarPermission).not.toHaveBeenCalled();
      expect(mockStartScheduler).toHaveBeenCalledOnce();
    });

    it("skips permission request when already granted", async () => {
      mockGetCalendarPermissionStatus.mockResolvedValueOnce("granted");

      await initializeApp(mockWindow);

      expect(mockGetCalendarPermissionStatus).toHaveBeenCalledOnce();
      expect(mockRequestCalendarPermission).not.toHaveBeenCalled();
    });

    it("skips permission request when denied", async () => {
      mockGetCalendarPermissionStatus.mockResolvedValueOnce("denied");

      await initializeApp(mockWindow);

      expect(mockGetCalendarPermissionStatus).toHaveBeenCalledOnce();
      expect(mockRequestCalendarPermission).not.toHaveBeenCalled();
    });

    it("syncs auto-launch with launchAtLogin from settings", async () => {
      mockGetSettings.mockReturnValue(
        createMockSettings({ launchAtLogin: true }),
      );

      await initializeApp(mockWindow);

      expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true);
    });
  })

  describe("power callback", () => {
    it("invalidates calendar permission cache before restarting scheduler on wake/unlock", async () => {
      await initializeApp(mockWindow);

      expect(mockInitPowerManagement).toHaveBeenCalledOnce();
      const callback = mockInitPowerManagement.mock.calls[0]?.[0] as (() => void) | undefined;
      expect(typeof callback).toBe("function");

      const callOrder: string[] = [];
      mockInvalidateCalendarPermissionCache.mockImplementation(() => callOrder.push("invalidate"));
      mockRestartScheduler.mockImplementation(() => callOrder.push("restart"));

      callback!();

      expect(mockInvalidateCalendarPermissionCache).toHaveBeenCalledOnce();
      expect(mockRestartScheduler).toHaveBeenCalledOnce();
      expect(callOrder).toEqual(["invalidate", "restart"]);
    });
  });

  describe("fail-fast", () => {
    it("aborts init when setupTray throws (startScheduler not called)", async () => {
      const electron = await import("electron");
      mockSetupTray.mockImplementationOnce(() => {
        throw new Error("tray boom");
      });

      await initializeApp(mockWindow);

      expect(electron.dialog.showErrorBox).toHaveBeenCalledWith(
        "GogMeet Startup Error",
        expect.stringContaining("setupTray"),
      );
      expect(electron.app.quit).toHaveBeenCalled();
      expect(mockStartScheduler).not.toHaveBeenCalled();
    });

    it("aborts init when loadSettings throws (startScheduler not called)", async () => {
      const electron = await import("electron");
      mockLoadSettings.mockRejectedValueOnce(new Error("fs boom"));

      await initializeApp(mockWindow);

      expect(electron.dialog.showErrorBox).toHaveBeenCalledWith(
        "GogMeet Startup Error",
        expect.stringContaining("loadSettings"),
      );
      expect(electron.app.quit).toHaveBeenCalled();
      expect(mockStartScheduler).not.toHaveBeenCalled();
    });
  });


  describe("shutdownApp", () => {
    it("calls cleanupPowerManagement and stopScheduler", () => {
      shutdownApp();

      expect(mockCleanupPowerManagement).toHaveBeenCalledOnce();
      expect(mockStopScheduler).toHaveBeenCalledOnce();
    });

    it("force-destroys hide-cached dialog windows", () => {
      shutdownApp();

      expect(mockDestroyAlertWindow).toHaveBeenCalledOnce();
      expect(mockDestroySettingsWindow).toHaveBeenCalledOnce();
      expect(mockDestroyAboutWindow).toHaveBeenCalledOnce();
    });

    it("destroys dialogs after power cleanup and before scheduler stop", () => {
      const callOrder: string[] = [];
      mockCleanupPowerManagement.mockImplementation(() => callOrder.push("cleanup"));
      mockDestroyAlertWindow.mockImplementation(() => callOrder.push("destroy-alert"));
      mockDestroySettingsWindow.mockImplementation(() => callOrder.push("destroy-settings"));
      mockDestroyAboutWindow.mockImplementation(() => callOrder.push("destroy-about"));
      mockStopScheduler.mockImplementation(() => callOrder.push("stop"));

      shutdownApp();

      expect(callOrder).toEqual([
        "cleanup",
        "destroy-alert",
        "destroy-settings",
        "destroy-about",
        "stop",
      ]);
    });

    it("calls cleanupPowerManagement before stopScheduler", () => {
      const callOrder: string[] = [];
      mockCleanupPowerManagement.mockImplementation(() => callOrder.push("cleanup"));
      mockStopScheduler.mockImplementation(() => callOrder.push("stop"));

      shutdownApp();

      expect(callOrder[0]).toBe("cleanup");
      expect(callOrder[callOrder.length - 1]).toBe("stop");
    });
  });
});
