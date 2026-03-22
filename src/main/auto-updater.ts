import { autoUpdater } from "electron-updater";
import { app } from "electron";
import log from "electron-log";

/**
 * Initialize electron-updater.
 * Only checks for updates in packaged builds (not dev mode).
 * Downloads and installs on app quit.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    log.info(`[auto-updater] Update available: v${info.version}`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info(`[auto-updater] Update downloaded: v${info.version}`);
  });

  autoUpdater.on("error", (err) => {
    log.error("[auto-updater] Update error:", err);
  });

  // Check for updates on startup (with a short delay to avoid blocking app init)
  setTimeout(() => {
    void autoUpdater.checkForUpdates();
  }, 5000);
}
