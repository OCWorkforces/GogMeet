import { app } from "electron";

/**
 * Get the current auto-launch (login item) status.
 * Returns true if the app is set to launch at login.
 */
export function getAutoLaunchStatus(): boolean {
  try {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  } catch (error) {
    console.error("[auto-launch] Failed to get login item status:", error);
    return false;
  }
}

/**
 * Enable or disable auto-launch at login.
 * @param enabled - Whether to launch the app at login
 */
export function setAutoLaunch(enabled: boolean): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false,
    });
    console.log(
      `[auto-launch] ${enabled ? "Enabled" : "Disabled"} launch at login`,
    );
  } catch (error) {
    console.error("[auto-launch] Failed to set login item:", error);
  }
}

/**
 * Sync the auto-launch setting with the system.
 * Call this when the app starts or when settings change.
 * @param enabled - Whether auto-launch should be enabled
 */
export function syncAutoLaunch(enabled: boolean): void {
  const currentStatus = getAutoLaunchStatus();
  if (currentStatus !== enabled) {
    setAutoLaunch(enabled);
  }
}
