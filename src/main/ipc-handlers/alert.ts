import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import type { EventId } from "../../shared/brand.js";
import { cancelPendingBrowserOpen } from "../scheduler/facade.js";
import { validateOnSender } from "./shared.js";

/**
 * Register IPC handlers for alert-related fire-and-forget channels.
 *
 * `alert:dismissed` — sent by the renderer when the user dismisses the
 * full-screen meeting alert. Cancels any pending browser auto-open timer
 * for the event and marks it as fired so refresh polls do not re-arm it.
 */
export function registerAlertHandlers(): void {
  ipcMain.on(IPC_CHANNELS.ALERT_DISMISSED, (event, payload: { id: EventId }) => {
    if (!validateOnSender(event)) return;
    cancelPendingBrowserOpen(payload.id);
  });
}
