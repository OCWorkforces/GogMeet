import { app, dialog, type BrowserWindow } from "electron";
import { setupTray, forceTrayMenuRefresh, updateTrayTitle } from "../tray.js";
import { registerIpcHandlers } from "./ipc.js";
import {
  initPowerManagement,
  initPowerEvents,
  cleanupPowerManagement,
  getPollInterval,
  preventSleep,
  allowSleep,
} from "../system/power.js";
import { syncAutoLaunch } from "../system/auto-launch.js";
import { checkNotificationPermission } from "../system/notification.js";
import { registerShortcuts, unregisterShortcuts } from "../system/shortcuts.js";
import { initAutoUpdater } from "../system/auto-updater.js";
import { onDisplayHorizonTick, clearDisplayHorizon } from "../system/display-horizon.js";
import { createAppGraph, type AppGraph } from "../composition/app-graph.js";
import { stopScheduler, republishUiForDisplayTick } from "../scheduler/facade.js";
import { stopCalendarWatcher } from "../facades/calendar-watcher.js";

/** Active graph for this process (set during initializeApp). */
let activeGraph: AppGraph | null = null;

/** Unsubscribe for display-horizon → UI refresh wiring. */
let unsubscribeDisplayHorizon: (() => void) | null = null;

export function getActiveAppGraph(): AppGraph | null {
  return activeGraph;
}

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
    // Composition root: wire adapters/use-case defaults before IPC
    let graph!: AppGraph;
    tryRunCritical("createAppGraph", () => {
      graph = createAppGraph();
      activeGraph = graph;
    });

    // Pre-warm calendar provider (Swift compile on Darwin) — don't block init
    tryRun("warmupCalendarProvider", () => {
      graph.calendar.warmup().catch((err: unknown) => {
        console.warn("[lifecycle] Calendar provider pre-warm failed:", err);
      });
    });

    // Register IPC handlers before any async ops — renderer may call channels early
    tryRunCritical("registerIpcHandlers", () => registerIpcHandlers(mainWindow, graph));

    // Load settings and check calendar permission in parallel
    await Promise.all([
      tryRunAsyncCritical("loadSettings", async () => {
        const result = await graph.settings.load();
        if (!result.ok) {
          console.warn("[lifecycle] Settings load warning:", result.error);
        }
      }),
      tryRunAsync("calendarPermission", async () => {
        const calendarPerm = await graph.calendar.getPermissionStatus();
        // Darwin: request EventKit when not determined. Windows: never auto-OAuth.
        if (calendarPerm === "not-determined" && graph.calendar.shouldAutoRequestPermission()) {
          console.log("[lifecycle] Calendar permission not determined — requesting...");
          await graph.calendar.requestPermission();
        }
      }),
    ]);

    tryRunCritical("setupTray", () => setupTray(mainWindow, graph));
    tryRun("setTrayTitleCallback", () => graph.scheduler.setTrayTitleCallback(updateTrayTitle));
    tryRun("setSchedulerWindow", () => graph.scheduler.setWindow(mainWindow));
    tryRun("initPowerCallbacks", () =>
      graph.scheduler.initPowerCallbacks({ getPollInterval, preventSleep, allowSleep }),
    );
    tryRun("wireDisplayHorizon", () => {
      unsubscribeDisplayHorizon?.();
      unsubscribeDisplayHorizon = onDisplayHorizonTick(() => {
        // Wall clock crossed a start/end boundary: force list UI to re-filter.
        republishUiForDisplayTick();
        forceTrayMenuRefresh();
      });
    });

    tryRun("startScheduler", () => graph.scheduler.start());
    tryRun("startCalendarWatcher", () => graph.watcher.start());
    tryRun("initPowerManagement", () =>
      initPowerManagement(() => {
        graph.calendar.invalidatePermissionCache();
        graph.watcher.revive();
        graph.scheduler.restart();
      }),
    );
    tryRun("initPowerEvents", () => initPowerEvents());
    tryRun("registerShortcuts", () => registerShortcuts(graph));

    tryRun("checkNotificationPermission", () => {
      void checkNotificationPermission();
    });

    tryRun("syncAutoLaunch", () => {
      const settings = graph.settings.get();
      syncAutoLaunch(settings.launchAtLogin);
    });

    tryRun("initAutoUpdater", () => {
      initAutoUpdater();
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
  unsubscribeDisplayHorizon?.();
  unsubscribeDisplayHorizon = null;
  clearDisplayHorizon();
  const graph = activeGraph;
  if (graph) {
    graph.scheduler.stop();
    graph.watcher.stop();
  } else {
    // No graph (tests / early quit) — fall back to free-function stop.
    stopScheduler();
    stopCalendarWatcher();
  }
  unregisterShortcuts();
  activeGraph = null;
}
