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
import { Notification, dialog, shell } from "electron";

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

    it("marks as asked via writeFileSync after showing dialog", async () => {
      vi.mocked(Notification.isSupported).mockReturnValue(true);
      vi.mocked(dialog.showMessageBox).mockResolvedValue({
        response: 1,
      } as never);

      await checkNotificationPermission();

      // markAsAsked writes a file, not a directory
      expect(
        existsSync(join(MOCK_USER_DATA_PATH, ".notification-asked")),
      ).toBe(true);
    });

    it("creates userData directory if it does not exist", async () => {
      // Remove the userData directory entirely
      rmSync(MOCK_USER_DATA_PATH, { recursive: true, force: true });

      vi.mocked(Notification.isSupported).mockReturnValue(false);

      await checkNotificationPermission();

      // Should have re-created the directory and the flag file
      expect(existsSync(MOCK_USER_DATA_PATH)).toBe(true);
      expect(
        existsSync(join(MOCK_USER_DATA_PATH, ".notification-asked")),
      ).toBe(true);
    });

    it("shows dialog with correct options when notifications are supported", async () => {
      vi.mocked(Notification.isSupported).mockReturnValue(true);
      vi.mocked(dialog.showMessageBox).mockResolvedValue({
        response: 1,
      } as never);

      await checkNotificationPermission();

      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "info",
          buttons: ["Open System Settings", "Skip"],
          defaultId: 0,
          cancelId: 1,
          title: "Enable Notifications",
        }),
      );
    });

    it("falls back to general System Settings when notification pane URL fails", async () => {
      vi.mocked(Notification.isSupported).mockReturnValue(true);
      vi.mocked(dialog.showMessageBox).mockResolvedValue({
        response: 0,
      } as never);
      // First openExternal call rejects, triggering fallback
      vi.mocked(shell.openExternal).mockRejectedValueOnce(
        new Error("Failed") as never,
      );
      // Fallback call succeeds
      vi.mocked(shell.openExternal).mockResolvedValueOnce(undefined as never);

      await checkNotificationPermission();

      // Wait for the catch handler's async fallback to complete
      await vi.waitFor(() => {
        expect(shell.openExternal).toHaveBeenCalledTimes(2);
      });
      expect(shell.openExternal).toHaveBeenNthCalledWith(
        1,
        "x-apple.systempreferences:com.apple.preference.notifications",
      );
      expect(shell.openExternal).toHaveBeenNthCalledWith(
        2,
        "x-apple.systempreferences:",
      );
    });

    it("marks as asked even when notifications are not supported", async () => {
      vi.mocked(Notification.isSupported).mockReturnValue(false);

      await checkNotificationPermission();
      // Call again — should skip immediately
      await checkNotificationPermission();

      // Dialog should never have been shown
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });
  });
});
