import { ipcMain, type BrowserWindow } from "electron";
import { IPC_CHANNELS, type IpcRequest } from "../../shared/ipc-channels.js";
import {
  validateOnSender,
  MIN_WINDOW_HEIGHT,
  MAX_WINDOW_HEIGHT,
} from "./shared.js";

export function registerWindowHandlers(win: BrowserWindow): void {
  // Window height uses ipcMain.on for fire-and-forget (no response needed)
  ipcMain.on(
    IPC_CHANNELS.WINDOW_SET_HEIGHT,
    (event, height: IpcRequest<typeof IPC_CHANNELS.WINDOW_SET_HEIGHT>) => {
      if (!validateOnSender(event)) return;

      try {
        if (typeof height === "number" && height > 0) {
          // Clamp height to acceptable bounds
          const clampedHeight = Math.max(
            MIN_WINDOW_HEIGHT,
            Math.min(MAX_WINDOW_HEIGHT, Math.round(height)),
          );
          win.setSize(360, clampedHeight, true);
        }
      } catch (err) {
        console.error("[ipc] WINDOW_SET_HEIGHT error:", err);
      }
    },
  );
}
