import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { IpcChannelMap, PushChannelMap } from "../../shared/ipc-channels.js";

/** Accepted URL origins for IPC senders (renderer served from file:// or localhost in dev) */
const ALLOWED_ORIGINS = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

/** Acceptable height bounds for the popover window */
export const MIN_WINDOW_HEIGHT = 220;
export const MAX_WINDOW_HEIGHT = 480;

type IpcSenderEvent = {
  readonly senderFrame?: { readonly url?: string } | null;
};

/** Returns true if the sender's origin is the app's own renderer */
export function validateSender(event: IpcSenderEvent): boolean {
  const senderUrl = event.senderFrame?.url ?? "";
  return validateSenderUrl(senderUrl);
}

/** Validate sender for fire-and-forget (ipcMain.on) events */
export function validateOnSender(event: IpcSenderEvent): boolean {
  const senderUrl = event.senderFrame?.url ?? "";
  return validateSenderUrl(senderUrl);
}

function validateSenderUrl(senderUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(senderUrl);
  } catch {
    console.warn("[ipc] Rejected IPC with malformed sender URL:", senderUrl);
    return false;
  }

  if (ALLOWED_ORIGINS.has(parsed.origin) && parsed.username === "" && parsed.password === "") {
    return true;
  }

  if (
    parsed.protocol === "file:" &&
    parsed.host === "" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    parsed.username === "" &&
    parsed.password === ""
  ) {
    try {
      if (isAllowedRendererFile(parsed)) {
        return true;
      }
    } catch {
      console.warn("[ipc] Rejected IPC with malformed file sender URL:", senderUrl);
      return false;
    }
  }

  // Log unauthorized attempt for security auditing
  console.warn("[ipc] Rejected IPC from unauthorized sender:", senderUrl);
  return false;
}

function isAllowedRendererFile(senderUrl: URL): boolean {
  const rendererDirectory = path.resolve(app.getAppPath(), "lib", "renderer");
  const senderPath = path.resolve(fileURLToPath(senderUrl));
  return (
    senderPath === path.join(rendererDirectory, "index.html") ||
    senderPath === path.join(rendererDirectory, "settings.html") ||
    senderPath === path.join(rendererDirectory, "alert.html")
  );
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
    // trust-boundary: Electron's ipcMain.handle is structurally untyped; the channel-key generic K guarantees the request shape at all call sites of typedHandle
    handler(event, args[0] as IpcChannelMap[K]["request"]),
  );
}

/**
 * Type-safe wrapper for main→renderer push channels (webContents.send).
 * Ensures payload type matches PushChannelMap entry and guards against destroyed webContents.
 */
export function typedSend<K extends keyof PushChannelMap>(
  wc: Electron.WebContents,
  channel: K,
  payload: PushChannelMap[K],
): void {
  if (wc.isDestroyed()) return;
  wc.send(channel, payload);
}
