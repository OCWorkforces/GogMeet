import type { BrowserWindow } from "electron";
import { IPC_CHANNELS, type IpcRequest, type IpcResponse } from "../../shared/ipc-channels.js";
import { getSettings, updateSettings } from "../settings.js";
import { restartScheduler } from "../scheduler/index.js";
import { syncAutoLaunch } from "../auto-launch.js";
import { validateSender, typedHandle } from "./shared.js";

export function registerSettingsHandlers(win: BrowserWindow): void {
  typedHandle(
    IPC_CHANNELS.SETTINGS_GET,
    (event): IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET> => {
      if (!validateSender(event)) return getSettings();
      return getSettings();
    },
  );

  typedHandle(
    IPC_CHANNELS.SETTINGS_SET,
    (
      event,
      partial: IpcRequest<typeof IPC_CHANNELS.SETTINGS_SET>,
    ): IpcResponse<typeof IPC_CHANNELS.SETTINGS_SET> => {
      if (!validateSender(event)) return getSettings();
      const updated = updateSettings(partial);
      restartScheduler(); // Apply new timing immediately

      // Sync auto-launch if the setting changed
      if (typeof partial.launchAtLogin === "boolean") {
        syncAutoLaunch(partial.launchAtLogin);
      }

      // Notify popover window to refresh if settings affect display
      if (
        partial.showTomorrowMeetings !== undefined ||
        partial.launchAtLogin !== undefined ||
        partial.openBeforeMinutes !== undefined ||
        partial.windowAlert !== undefined
      ) {
        win.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, updated);
      }

      return updated;
    },
  );
}
