import type { BrowserWindow } from "electron";
import { setupTray } from "./tray.js";
import { registerIpcHandlers } from "./ipc.js";
import {
  startScheduler,
  stopScheduler,
  restartScheduler,
  setSchedulerWindow,
  setTrayTitleCallback,
} from "./scheduler/index.js";
import {
  initPowerManagement,
  cleanupPowerManagement,
} from "./power.js";
import { updateTrayTitle } from "./tray.js";
import { getSettings } from "./settings.js";
import { syncAutoLaunch } from "./auto-launch.js";
import { checkNotificationPermission } from "./notification.js";
import { registerShortcuts } from "./shortcuts.js";

/**
 * Initialize all app subsystems after Electron is ready.
 * Called once from app.whenReady() in index.ts.
 */
export function initializeApp(mainWindow: BrowserWindow): void {
  registerIpcHandlers(mainWindow);
  setupTray(mainWindow);
  setTrayTitleCallback(updateTrayTitle);
  setSchedulerWindow(mainWindow);
  startScheduler();
  initPowerManagement(() => restartScheduler());
  registerShortcuts();

  // Check notification permission on first run
  void checkNotificationPermission();

  // Sync auto-launch setting on startup
  const settings = getSettings();
  syncAutoLaunch(settings.launchAtLogin);
}

/**
 * Shut down all app subsystems before quit.
 * Called from app.on("before-quit") in index.ts.
 */
export function shutdownApp(): void {
  cleanupPowerManagement();
  stopScheduler();
}
