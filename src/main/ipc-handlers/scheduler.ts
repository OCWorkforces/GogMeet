import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import { forcePoll } from "../scheduler/facade.js";
import { validateOnSender } from "./shared.js";

export function registerSchedulerHandlers(): void {
  ipcMain.on(IPC_CHANNELS.SCHEDULER_FORCE_POLL, (event) => {
    if (!validateOnSender(event)) return;
    void forcePoll();
  });
}
