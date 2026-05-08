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
import { getCalendarPermissionStatus, requestCalendarPermission } from "./calendar.js";
import {
  initPowerManagement,
  initPowerEvents,
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
import { ensureBinary } from "./swift/binary-manager.js";
import { startCalendarWatcher, stopCalendarWatcher } from "./calendar-watcher.js";

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
      throw new Error(`${label}: ${error.message}`, { cause: err });
    }
  };
  const tryRunAsyncCritical = async (label: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[lifecycle] ${label} failed:`, error);
      throw new Error(`${label}: ${error.message}`, { cause: err });
    }
  };

  try {
    // Pre-warm Swift binary in background — don't block init
    tryRun("preWarmSwiftBinary", () => {
      ensureBinary().catch((err: unknown) => {
        console.warn("[lifecycle] Swift binary pre-warm failed:", err);
      });
    });

    // Register IPC handlers before any async ops — renderer may call channels early
    tryRunCritical("registerIpcHandlers", () => registerIpcHandlers(mainWindow));

    // Load settings and check calendar permission in parallel
    // loadSettings is critical (must succeed before scheduler starts);
    // calendarPermission is non-critical (errors collected, no throw)
    await Promise.all([
      tryRunAsyncCritical("loadSettings", async () => {
        const result = await loadSettings();
        if (!result.ok) {
          console.warn("[lifecycle] Settings load warning:", result.error);
        }
      }),
      tryRunAsync("calendarPermission", async () => {
        const calendarPerm = await getCalendarPermissionStatus();
        if (calendarPerm === "not-determined") {
          console.log("[lifecycle] Calendar permission not determined — requesting...");
          await requestCalendarPermission();
        }
      }),
    ]);

    tryRunCritical("setupTray", () => setupTray(mainWindow));
    tryRun("setTrayTitleCallback", () => setTrayTitleCallback(updateTrayTitle));
    tryRun("setSchedulerWindow", () => setSchedulerWindow(mainWindow));
    tryRun("initPowerCallbacks", () =>
      initPowerCallbacks({ getPollInterval, preventSleep, allowSleep }),
    );

    tryRun("startScheduler", () => startScheduler());
    tryRun("startCalendarWatcher", () => startCalendarWatcher());
    tryRun("initPowerManagement", () => initPowerManagement(() => restartScheduler()));
    tryRun("initPowerEvents", () => initPowerEvents());
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
  stopCalendarWatcher();
  unregisterShortcuts();
}
