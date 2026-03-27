import type { BrowserWindow } from "electron";
import { validateSender } from "./ipc-handlers/shared.js";
import { registerCalendarHandlers } from "./ipc-handlers/calendar.js";
import { registerSettingsHandlers } from "./ipc-handlers/settings.js";
import { registerAppHandlers } from "./ipc-handlers/app.js";
import { registerWindowHandlers } from "./ipc-handlers/window.js";

export { validateSender };

/**
 * Registers all IPC handlers for the application.
 * Handler implementations live in focused modules under ipc-handlers/.
 */
export function registerIpcHandlers(win: BrowserWindow): void {
  registerCalendarHandlers();
  registerSettingsHandlers(win);
  registerAppHandlers();
  registerWindowHandlers(win);
}
