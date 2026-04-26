import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS, type IpcRequest, type IpcResponse } from "../../shared/ipc-channels.js";
import { getSettings, updateSettings } from "../settings.js";
import { restartScheduler } from "../scheduler/facade.js";
import { syncAutoLaunch } from "../auto-launch.js";
import { validateSender, typedHandle, typedSend } from "./shared.js";

export function registerSettingsHandlers(win: BrowserWindow): void {
  typedHandle(
    IPC_CHANNELS.SETTINGS_GET,
    (_event: IpcMainInvokeEvent): IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET> => {
      return getSettings();
    },
  );

  typedHandle(
    IPC_CHANNELS.SETTINGS_SET,
    async (
      event: IpcMainInvokeEvent,
      partial: IpcRequest<typeof IPC_CHANNELS.SETTINGS_SET>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_SET>> => {
      if (!validateSender(event)) return getSettings();
      try {
        const updated = await updateSettings(partial);
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
          typedSend(win.webContents, IPC_CHANNELS.SETTINGS_CHANGED, updated);
        }

        return updated;
      } catch (err) {
        console.error("[ipc] SETTINGS_SET error:", err);
        return getSettings();
      }
    },
  );
}
