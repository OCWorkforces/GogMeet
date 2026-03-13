import { Notification, dialog, shell, app } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Path to store notification permission status */
function getPermissionFlagPath(): string {
  const userData = app.getPath("userData");
  return join(userData, ".notification-asked");
}

/** Check if we've already asked about notifications */
function hasAskedBefore(): boolean {
  return existsSync(getPermissionFlagPath());
}

/** Mark that we've asked about notifications */
function markAsAsked(): void {
  const userData = app.getPath("userData");
  if (!existsSync(userData)) {
    mkdirSync(userData, { recursive: true });
  }
  writeFileSync(getPermissionFlagPath(), "true");
}

/** Check notification permission and prompt user if needed */
export async function checkNotificationPermission(): Promise<void> {
  // Skip if already asked
  if (hasAskedBefore()) {
    console.log("[notification] Already asked about notifications");
    return;
  }

  // Check if notifications are supported
  if (!Notification.isSupported()) {
    console.log("[notification] Notifications not supported on this system");
    markAsAsked();
    return;
  }

  // Mark as asked so we don't prompt again
  markAsAsked();

  // Show dialog asking user to enable notifications
  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: ["Open System Settings", "Skip"],
    defaultId: 0,
    cancelId: 1,
    title: "Enable Notifications",
    message: "GogMeet needs notification permission to remind you about meetings.",
    detail:
      "Would you like to open System Settings to enable notifications for GogMeet?",
  });

  if (response === 0) {
    // Open macOS System Settings > Notifications
    // Using x-apple.systempreferences: to open directly to notifications pane
    shell
      .openExternal("x-apple.systempreferences:com.apple.preference.notifications")
      .catch((err) => {
        console.error("[notification] Failed to open System Settings:", err);
        // Fallback: open general System Settings
        shell.openExternal("x-apple.systempreferences:").catch(() => {});
      });
  }
}
