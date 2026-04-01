import { describe, it, expect, vi, beforeEach } from "vitest";

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
  mockSyncAutoLaunch,
  mockCheckNotificationPermission,
  mockRegisterShortcuts,
  mockInitPowerManagement,
  mockCleanupPowerManagement,
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
  mockSyncAutoLaunch: vi.fn(),
  mockCheckNotificationPermission: vi.fn().mockResolvedValue(undefined),
  mockRegisterShortcuts: vi.fn(),
  mockInitPowerManagement: vi.fn(),
  mockCleanupPowerManagement: vi.fn(),
}));

// Mock all subsystem modules that lifecycle.ts imports
vi.mock("../../src/main/ipc.js", () => ({
  registerIpcHandlers: mockRegisterIpcHandlers,
}));

vi.mock("../../src/main/tray.js", () => ({
  setupTray: mockSetupTray,
  updateTrayTitle: mockUpdateTrayTitle,
}));

vi.mock("../../src/main/scheduler/index.js", () => ({
  startScheduler: mockStartScheduler,
  stopScheduler: mockStopScheduler,
  restartScheduler: mockRestartScheduler,
  setSchedulerWindow: mockSetSchedulerWindow,
  setTrayTitleCallback: mockSetTrayTitleCallback,
}));

vi.mock("../../src/main/settings.js", () => ({
  getSettings: mockGetSettings,
}));

vi.mock("../../src/main/auto-launch.js", () => ({
  syncAutoLaunch: mockSyncAutoLaunch,
}));

vi.mock("../../src/main/notification.js", () => ({
  checkNotificationPermission: mockCheckNotificationPermission,
}));

vi.mock("../../src/main/shortcuts.js", () => ({
  registerShortcuts: mockRegisterShortcuts,
}));

vi.mock("../../src/main/power.js", () => ({
  initPowerManagement: mockInitPowerManagement,
  cleanupPowerManagement: mockCleanupPowerManagement,
}));

import { initializeApp, shutdownApp } from "../../src/main/lifecycle.js";

const mockWindow = {} as unknown as import("electron").BrowserWindow;

describe("lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initializeApp", () => {
    it("calls all subsystem init functions", () => {
      initializeApp(mockWindow);

      // IPC handlers registered with main window
      expect(mockRegisterIpcHandlers).toHaveBeenCalledWith(mockWindow);

      // Tray set up with main window
      expect(mockSetupTray).toHaveBeenCalledWith(mockWindow);

      // Scheduler receives tray callback and window reference
      expect(mockSetTrayTitleCallback).toHaveBeenCalledWith(
        mockUpdateTrayTitle,
      );
      expect(mockSetSchedulerWindow).toHaveBeenCalledWith(mockWindow);

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
    });

    it("syncs auto-launch with launchAtLogin from settings", () => {
      mockGetSettings.mockReturnValue({
        schemaVersion: 1,
        openBeforeMinutes: 1,
        launchAtLogin: true,
        showTomorrowMeetings: true,
        windowAlert: true,
      });

      initializeApp(mockWindow);

      expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true);
    });
  });

  describe("shutdownApp", () => {
    it("calls cleanupPowerManagement and stopScheduler", () => {
      shutdownApp();

      expect(mockCleanupPowerManagement).toHaveBeenCalledOnce();
      expect(mockStopScheduler).toHaveBeenCalledOnce();
    });

    it("calls cleanupPowerManagement before stopScheduler", () => {
      const callOrder: string[] = [];
      mockCleanupPowerManagement.mockImplementation(() => callOrder.push("cleanup"));
      mockStopScheduler.mockImplementation(() => callOrder.push("stop"));

      shutdownApp();

      expect(callOrder).toEqual(["cleanup", "stop"]);
    });
  });
});
