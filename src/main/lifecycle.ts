import { app, dialog, type BrowserWindow } from "electron";
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
import { getSettings, loadSettings } from "./settings.js";
import { syncAutoLaunch } from "./auto-launch.js";
import { checkNotificationPermission } from "./notification.js";
import { registerShortcuts, unregisterShortcuts } from "./shortcuts.js";

/**
 * Initialize all app subsystems after Electron is ready.
 * Called once from app.whenReady() in index.ts.
 */
export async function initializeApp(mainWindow: BrowserWindow): Promise<void> {
  const errors: Error[] = [];
  const tryRun = (label: string, fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[lifecycle] ${label} failed:`, error);
      errors.push(new Error(`${label}: ${error.message}`));
    }
  };
  const tryRunAsync = async (label: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[lifecycle] ${label} failed:`, error);
      errors.push(new Error(`${label}: ${error.message}`));
    }
  };
  const tryRunCritical = (label: string, fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[lifecycle] ${label} failed:`, error);
      throw new Error(`${label}: ${error.message}`);
    }
  };
  const tryRunAsyncCritical = async (label: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[lifecycle] ${label} failed:`, error);
      throw new Error(`${label}: ${error.message}`);
    }
  };

  try {
    tryRun("registerIpcHandlers", () => registerIpcHandlers(mainWindow));
    tryRunCritical("setupTray", () => setupTray(mainWindow, getCalendarEventsResult));
    tryRun("setTrayTitleCallback", () => setTrayTitleCallback(updateTrayTitle));
    tryRun("setSchedulerWindow", () => setSchedulerWindow(mainWindow));
    tryRun("initPowerCallbacks", () =>
      initPowerCallbacks({ getPollInterval, preventSleep, allowSleep }),
    );

    // Check calendar permission before starting the scheduler
    // If permission hasn't been determined yet, request it (triggers macOS dialog)
    await tryRunAsync("calendarPermission", async () => {
      const calendarPerm = await getCalendarPermissionStatus();
      if (calendarPerm === "not-determined") {
        console.log("[lifecycle] Calendar permission not determined — requesting...");
        await requestCalendarPermission();
      }
    });

    // Ensure settings are loaded before starting scheduler
    await tryRunAsyncCritical("loadSettings", async () => {
      const result = await loadSettings();
      if (!result.ok) {
        console.warn("[lifecycle] Settings load warning:", result.error);
      }
    });

    tryRun("startScheduler", () => startScheduler());
    tryRun("initPowerManagement", () => initPowerManagement(() => restartScheduler()));
    tryRun("registerShortcuts", () => registerShortcuts());

    // Check notification permission on first run
    tryRun("checkNotificationPermission", () => {
      void checkNotificationPermission();
    });

    // Sync auto-launch setting on startup
    tryRun("syncAutoLaunch", () => {
      const settings = getSettings();
      syncAutoLaunch(settings.launchAtLogin);
    });

    if (errors.length > 0) {
      const message = errors.map((e) => `• ${e.message}`).join("\n");
      throw new Error(`One or more subsystems failed to initialize:\n${message}`);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[lifecycle]", error);
    dialog.showErrorBox("GogMeet Startup Error", error.message);
    app.quit();
  }
}

/**
 * Shut down all app subsystems before quit.
 * Called from app.on("before-quit") in index.ts.
 */
export function shutdownApp(): void {
  cleanupPowerManagement();
  stopScheduler();
  unregisterShortcuts();
}
