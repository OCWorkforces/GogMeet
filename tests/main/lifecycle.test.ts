import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for mock functions used in vi.mock factories
const {
  mockRegisterIpcHandlers,
  mockSetupTray,
  mockUpdateTrayTitle,
  mockStartScheduler,
  mockStopScheduler,
  mockSetSchedulerWindow,
  mockSetTrayTitleCallback,
  mockGetSettings,
  mockSyncAutoLaunch,
  mockCheckNotificationPermission,
  mockRegisterShortcuts,
} = vi.hoisted(() => ({
  mockRegisterIpcHandlers: vi.fn(),
  mockSetupTray: vi.fn(),
  mockUpdateTrayTitle: vi.fn(),
  mockStartScheduler: vi.fn(),
  mockStopScheduler: vi.fn(),
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
    it("calls stopScheduler", () => {
      shutdownApp();

      expect(mockStopScheduler).toHaveBeenCalledOnce();
    });
  });
});
