import { autoUpdater } from "electron-updater";
import { app } from "electron";
import log from "electron-log";

/**
 * True when this process is the electron-builder portable build (K26).
 * Portable installs must not auto-update.
 */
export function isPortableInstall(): boolean {
  const portableDir = process.env["PORTABLE_EXECUTABLE_DIR"];
  if (typeof portableDir === "string" && portableDir.length > 0) {
    return true;
  }
  const portableFile = process.env["PORTABLE_EXECUTABLE_FILE"];
  if (typeof portableFile === "string" && portableFile.length > 0) {
    return true;
  }
  if (process.env["GOGMEET_PORTABLE"] === "1") {
    return true;
  }
  return false;
}

/**
 * Initialize electron-updater for packaged non-portable installs.
 * Logs only on failure — no user-facing spam if the feed is missing.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }

  if (isPortableInstall()) {
    log.info("[auto-updater] Portable install — updates disabled");
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
    // Missing latest.yml / rate limits / network — log once-style via electron-log
    log.error("[auto-updater] Update error:", err);
  });

  // Check for updates on startup (short delay so init is not blocked)
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err: unknown) => {
      log.error("[auto-updater] checkForUpdates failed:", err);
    });
  }, 5000);
}
