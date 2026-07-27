import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import type { AppGraph } from "../composition/app-graph.js";
import { validateOnSender } from "./shared.js";

export function registerSchedulerHandlers(graph: AppGraph): void {
  ipcMain.on(IPC_CHANNELS.SCHEDULER_FORCE_POLL, (event) => {
    if (!validateOnSender(event)) return;
    void graph.scheduler.forcePoll();
  });
}
