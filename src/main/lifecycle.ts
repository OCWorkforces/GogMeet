import type { BrowserWindow } from "electron";
import { setupTray } from "./tray.js";
import { registerIpcHandlers } from "./ipc.js";
import {
  startScheduler,
  stopScheduler,
  restartScheduler,
  setSchedulerWindow,
  setTrayTitleCallback,
  initPowerCallbacks,
} from "./scheduler/facade.js";
import {
  getCalendarPermissionStatus,
  requestCalendarPermission,
  getCalendarEventsResult,
} from "./calendar.js";
import {
  initPowerManagement,
  cleanupPowerManagement,
  getPollInterval,
  preventSleep,
  allowSleep,
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
export async function initializeApp(mainWindow: BrowserWindow): Promise<void> {
  registerIpcHandlers(mainWindow);
  setupTray(mainWindow, getCalendarEventsResult);
  setTrayTitleCallback(updateTrayTitle);
  setSchedulerWindow(mainWindow);
  initPowerCallbacks({ getPollInterval, preventSleep, allowSleep });

  // Check calendar permission before starting the scheduler
  // If permission hasn't been determined yet, request it (triggers macOS dialog)
  const calendarPerm = await getCalendarPermissionStatus();
  if (calendarPerm === "not-determined") {
    console.log("[lifecycle] Calendar permission not determined — requesting...");
    await requestCalendarPermission();
  }

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
