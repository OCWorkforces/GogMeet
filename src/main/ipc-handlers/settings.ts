import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS, type IpcRequest, type IpcResponse } from "../../shared/ipc-channels.js";
import { getSettings, updateSettings } from "../facades/settings.js";
import { restartScheduler } from "../scheduler/facade.js";
import { syncAutoLaunch } from "../system/auto-launch.js";
import { DEFAULT_SETTINGS, type AppSettings } from "../../shared/settings.js";
import { forcePoll } from "../scheduler/facade.js";
import { validateSender, typedHandle, typedSend } from "./shared.js";

/** Keys that require restartScheduler() to reschedule timers / re-evaluate gates */
const TIMING_KEYS = new Set<keyof AppSettings>([
  "openBeforeMinutes",
  "windowAlert",
  "autoOpenEnabled",
  "alertLeadSeconds",
  "lateJoinGraceMinutes",
  "quietHoursEnabled",
  "quietHoursStart",
  "quietHoursEnd",
  "nativeNotifications",
]);

function settingsRequireSchedulerRestart(partial: Partial<AppSettings>): boolean {
  return (Object.keys(partial) as (keyof AppSettings)[]).some((k) => TIMING_KEYS.has(k));
}

export function registerSettingsHandlers(win: BrowserWindow): void {
  typedHandle(
    IPC_CHANNELS.SETTINGS_GET,
    (event: IpcMainInvokeEvent): IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET> => {
      if (!validateSender(event)) return { ...DEFAULT_SETTINGS };
      return getSettings();
    },
  );

  typedHandle(
    IPC_CHANNELS.SETTINGS_SET,
    async (
      event: IpcMainInvokeEvent,
      partial: IpcRequest<typeof IPC_CHANNELS.SETTINGS_SET>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_SET>> => {
      if (!validateSender(event)) return { ...DEFAULT_SETTINGS };
      try {
        const updated = await updateSettings(partial);

        if (settingsRequireSchedulerRestart(partial)) {
          restartScheduler();
        } else if (typeof partial.showTomorrowMeetings === "boolean") {
          void forcePoll();
        }

        if (typeof partial.launchAtLogin === "boolean") {
          syncAutoLaunch(partial.launchAtLogin);
        }

        typedSend(win.webContents, IPC_CHANNELS.SETTINGS_CHANGED, updated);
        return updated;
      } catch (err) {
        console.error("[ipc] SETTINGS_SET error:", err);
        return getSettings();
      }
    },
  );
}
