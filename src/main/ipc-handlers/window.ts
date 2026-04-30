import { ipcMain, type BrowserWindow } from "electron";
import { IPC_CHANNELS, type IpcRequest } from "../../shared/ipc-channels.js";
import { validateOnSender } from "./shared.js";

export function registerWindowHandlers(win: BrowserWindow): void {
  // Window height uses ipcMain.on for fire-and-forget (no response needed)
  ipcMain.on(
    IPC_CHANNELS.WINDOW_SET_HEIGHT,
    (event, payload: IpcRequest<typeof IPC_CHANNELS.WINDOW_SET_HEIGHT>) => {
      if (!validateOnSender(event)) return;

      try {
        const height = payload?.height;
        if (typeof height === "number" && height > 0) {
          // height is already clamped+branded by preload via clampWindowHeight().
          win.setSize(360, height, true);
        }
      } catch (err) {
        console.error("[ipc] WINDOW_SET_HEIGHT error:", err);
      }
    },
  );
}
