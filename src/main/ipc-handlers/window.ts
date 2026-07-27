import { ipcMain, type BrowserWindow } from "electron";
import { clampWindowHeight } from "../../domain/entities/brand.js";
import { IPC_CHANNELS, type IpcRequest } from "../../shared/ipc-channels.js";
import { validateOnSender } from "./shared.js";

export function registerWindowHandlers(win: BrowserWindow): void {
  // Window height uses ipcMain.on for fire-and-forget (no response needed)
  ipcMain.on(
    IPC_CHANNELS.WINDOW_SET_HEIGHT,
    (event, payload: IpcRequest<typeof IPC_CHANNELS.WINDOW_SET_HEIGHT>) => {
      if (!validateOnSender(event)) return;

      const height = payload?.height;
      if (typeof height !== "number" || !Number.isFinite(height)) return;

      win.setSize(360, clampWindowHeight(height), true);
    },
  );
}
