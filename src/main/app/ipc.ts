import type { BrowserWindow } from "electron";
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
export function registerIpcHandlers(win: BrowserWindow): void {
  registerCalendarHandlers();
  registerSettingsHandlers(win);
  registerAppHandlers();
  registerWindowHandlers(win);
  registerAlertHandlers();
  registerSchedulerHandlers();
}
