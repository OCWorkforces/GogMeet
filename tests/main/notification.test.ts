import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

// vi.mock is hoisted above all code, so the path must be a literal string in the mock factory
vi.mock("electron", () => ({
  Notification: {
    isSupported: vi.fn(),
  },
  dialog: {
    showMessageBox: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/gogmeet-notification-test"),
  },
}));

// Define the same path for use in tests
const MOCK_USER_DATA_PATH = "/tmp/gogmeet-notification-test";

// Import after mocking - using static imports like settings.test.ts
import { checkNotificationPermission } from "../../src/main/notification.js";
import { Notification, dialog, shell, app } from "electron";

describe("notification", () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Ensure clean temp directory
    if (existsSync(MOCK_USER_DATA_PATH)) {
      rmSync(MOCK_USER_DATA_PATH, { recursive: true, force: true });
    }
    mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });
  });

  afterEach(() => {
    // Cleanup temp directory
    if (existsSync(MOCK_USER_DATA_PATH)) {
      rmSync(MOCK_USER_DATA_PATH, { recursive: true, force: true });
    }
  });

  describe("checkNotificationPermission", () => {
    it("skips if already asked before", async () => {
      // Create the flag file to indicate we've already asked
      mkdirSync(join(MOCK_USER_DATA_PATH, ".notification-asked"), {
        recursive: true,
      });

      await checkNotificationPermission();

      // Should not show any dialog
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it("skips and marks asked if notifications not supported", async () => {
      vi.mocked(Notification.isSupported).mockReturnValue(false);

      await checkNotificationPermission();

      // Should not show dialog
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
      // Should have created the flag file
      expect(existsSync(join(MOCK_USER_DATA_PATH, ".notification-asked"))).toBe(
        true,
      );
    });

    it("opens system settings when user clicks button 0", async () => {
      vi.mocked(Notification.isSupported).mockReturnValue(true);
      vi.mocked(dialog.showMessageBox).mockResolvedValue({
        response: 0,
      } as never);
      vi.mocked(shell.openExternal).mockResolvedValue(undefined as never);

      await checkNotificationPermission();

      expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
      expect(shell.openExternal).toHaveBeenCalledWith(
        "x-apple.systempreferences:com.apple.preference.notifications",
      );
    });

    it("does nothing when user clicks button 1 (Skip)", async () => {
      vi.mocked(Notification.isSupported).mockReturnValue(true);
      vi.mocked(dialog.showMessageBox).mockResolvedValue({
        response: 1,
      } as never);

      await checkNotificationPermission();

      expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
      expect(shell.openExternal).not.toHaveBeenCalled();
    });
  });
});
