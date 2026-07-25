import { shell } from "electron";

const SYSTEM_SETTINGS_ROOT = "x-apple.systempreferences:";

/** Best-effort pane URLs — may no-op on some macOS versions; always fall back. */
const PANE_URLS = {
  notifications: ["x-apple.systempreferences:com.apple.preference.notifications"],
  calendars: [
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
    "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Calendars",
  ],
} as const;

export type SystemSettingsPane = keyof typeof PANE_URLS;

/**
 * Open macOS System Settings to a privacy/notifications pane.
 * Tries pane candidates in order, then falls back to System Settings root.
 */
export async function openSystemSettings(pane: SystemSettingsPane): Promise<void> {
  const candidates = PANE_URLS[pane];
  for (const url of candidates) {
    try {
      await shell.openExternal(url);
      return;
    } catch {
      // try next candidate
    }
  }
  await shell.openExternal(SYSTEM_SETTINGS_ROOT).catch((err: unknown) => {
    console.error("[system-settings] Failed to open System Settings:", err);
  });
}
