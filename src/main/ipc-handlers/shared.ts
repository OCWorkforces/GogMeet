import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import type { IpcChannelMap } from "../../shared/ipc-channels.js";

/** Accepted URL origins for IPC senders (renderer served from file:// or localhost in dev) */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

/** Acceptable height bounds for the popover window */
export const MIN_WINDOW_HEIGHT = 220;
export const MAX_WINDOW_HEIGHT = 480;

/** Returns true if the sender's origin is the app's own renderer */
export function validateSender(event: IpcMainInvokeEvent): boolean {
  const senderUrl = event.senderFrame?.url ?? "";
  return validateSenderUrl(senderUrl);
}

/** Validate sender for fire-and-forget (ipcMain.on) events */
export function validateOnSender(event: IpcMainEvent): boolean {
  const senderUrl = event.senderFrame?.url ?? "";
  return validateSenderUrl(senderUrl);
}

function validateSenderUrl(senderUrl: string): boolean {
  // file:// origin check (packaged app)
  if (senderUrl.startsWith("file://")) return true;
  // Dev server origins
  for (const origin of ALLOWED_ORIGINS) {
    if (senderUrl.startsWith(origin)) return true;
  }
  // Log unauthorized attempt for security auditing
  console.warn("[ipc] Rejected IPC from unauthorized sender:", senderUrl);
  return false;
}

/**
 * Type-safe IPC handler wrapper.
 * Ensures handler return type matches IpcChannelMap response type at compile time.
 */
export function typedHandle<K extends keyof IpcChannelMap>(
  channel: K,
  handler: (
    event: IpcMainInvokeEvent,
    request: IpcChannelMap[K]["request"],
  ) => Promise<IpcChannelMap[K]["response"]> | IpcChannelMap[K]["response"],
): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) =>
    handler(event, args[0] as IpcChannelMap[K]["request"]),
  );
}

export { ipcMain };
