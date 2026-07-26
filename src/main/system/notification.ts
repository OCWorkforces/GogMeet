import { Notification, dialog, shell, app } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isWin32 } from "../platform/os.js";

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

/**
 * Platform-specific deep links and copy for the notification settings dialog.
 * Exported for unit tests.
 */
export function getNotificationSettingsDeepLink(): {
  readonly primary: string;
  readonly fallback: string;
  readonly openButton: string;
  readonly settingsName: string;
} {
  if (isWin32()) {
    return {
      primary: "ms-settings:notifications",
      fallback: "ms-settings:",
      openButton: "Open Windows Settings",
      settingsName: "Windows Settings",
    };
  }
  return {
    primary: "x-apple.systempreferences:com.apple.preference.notifications",
    fallback: "x-apple.systempreferences:",
    openButton: "Open System Settings",
    settingsName: "System Settings",
  };
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

  const deepLink = getNotificationSettingsDeepLink();

  // Show dialog asking user to enable notifications
  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: [deepLink.openButton, "Skip"],
    defaultId: 0,
    cancelId: 1,
    title: "Enable Notifications",
    message: "GogMeet needs notification permission to remind you about meetings.",
    detail: `Would you like to open ${deepLink.settingsName} to enable notifications for GogMeet?`,
  });

  if (response === 0) {
    shell.openExternal(deepLink.primary).catch((err: unknown) => {
      console.error(`[notification] Failed to open ${deepLink.settingsName}:`, err);
      // Fallback: open general settings root for the platform
      shell.openExternal(deepLink.fallback).catch(() => {});
    });
  }
}
