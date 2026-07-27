import type { BrowserWindow } from "electron";
import type { AppGraph } from "../composition/app-graph.js";
import { registerCalendarHandlers } from "../ipc-handlers/calendar.js";
import { registerSettingsHandlers } from "../ipc-handlers/settings.js";
import { registerAppHandlers } from "../ipc-handlers/app.js";
import { registerWindowHandlers } from "../ipc-handlers/window.js";
import { registerSchedulerHandlers } from "../ipc-handlers/scheduler.js";
import { registerAlertHandlers } from "../ipc-handlers/alert.js";

/**
 * Registers all IPC handlers for the application.
 * Handler implementations live in focused modules under ipc-handlers/.
 */
export function registerIpcHandlers(win: BrowserWindow, graph: AppGraph): void {
  registerCalendarHandlers(graph);
  registerSettingsHandlers(win, graph);
  registerAppHandlers(graph);
  registerWindowHandlers(win);
  registerAlertHandlers(graph);
  registerSchedulerHandlers(graph);
}
