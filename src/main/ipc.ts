import {
  ipcMain,
  shell,
  app,
  BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import {
  IPC_CHANNELS,
  type IpcChannelMap,
  type IpcRequest,
  type IpcResponse,
} from "../shared/types.js";
import {
  getCalendarEventsResult,
  requestCalendarPermission,
  getCalendarPermissionStatus,
} from "./calendar.js";

import { getSettings, updateSettings } from "./settings.js";
import { restartScheduler } from "./scheduler.js";
import { isAllowedMeetUrl } from "./utils/url-validation.js";

/** Accepted URL origins for IPC senders (renderer served from file:// or localhost in dev) */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

/** Acceptable height bounds for the popover window */
const MIN_WINDOW_HEIGHT = 220;
const MAX_WINDOW_HEIGHT = 480;
/** Returns true if the sender's origin is the app's own renderer */
export function validateSender(event: IpcMainInvokeEvent): boolean {
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

function validateOnSender(event: IpcMainEvent): boolean {
  const senderUrl = event.senderFrame?.url ?? "";
  return validateSenderUrl(senderUrl);
}

/**
 * Type-safe IPC handler wrapper.
 * Ensures handler return type matches IpcChannelMap response type at compile time.
 */
function typedHandle<K extends keyof IpcChannelMap>(
  channel: K,
  handler: (
    event: IpcMainInvokeEvent,
    request: IpcChannelMap[K]["request"],
  ) => Promise<IpcChannelMap[K]["response"]> | IpcChannelMap[K]["response"],
): void {
  ipcMain.handle(channel, handler as Parameters<typeof ipcMain.handle>[1]);
}

export function registerIpcHandlers(win: BrowserWindow): void {
  // Calendar
  typedHandle(
    IPC_CHANNELS.CALENDAR_GET_EVENTS,
    async (
      event,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_GET_EVENTS>> => {
      if (!validateSender(event)) return { error: "unauthorized" };
      try {
        return await getCalendarEventsResult();
      } catch (err) {
        console.error("[ipc] CALENDAR_GET_EVENTS error:", err);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  typedHandle(
    IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION,
    async (
      event,
    ): Promise<
      IpcResponse<typeof IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION>
    > => {
      if (!validateSender(event)) return "denied";
      try {
        return await requestCalendarPermission();
      } catch (err) {
        console.error("[ipc] CALENDAR_REQUEST_PERMISSION error:", err);
        return "denied";
      }
    },
  );

  typedHandle(
    IPC_CHANNELS.CALENDAR_PERMISSION_STATUS,
    async (
      event,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_PERMISSION_STATUS>> => {
      if (!validateSender(event)) return "denied";
      try {
        return await getCalendarPermissionStatus();
      } catch (err) {
        console.error("[ipc] CALENDAR_PERMISSION_STATUS error:", err);
        return "denied";
      }
    },
  );
  // Window (uses ipcMain.on for fire-and-forget)
  ipcMain.on(
    IPC_CHANNELS.WINDOW_SET_HEIGHT,
    (event, height: IpcRequest<typeof IPC_CHANNELS.WINDOW_SET_HEIGHT>) => {
      if (!validateOnSender(event)) return;

      try {
        if (typeof height === "number" && height > 0) {
          // Clamp height to acceptable bounds
          const clampedHeight = Math.max(
            MIN_WINDOW_HEIGHT,
            Math.min(MAX_WINDOW_HEIGHT, Math.round(height)),
          );
          win.setSize(360, clampedHeight, true);
        }
      } catch (err) {
        console.error("[ipc] WINDOW_SET_HEIGHT error:", err);
      }
    },
  );

  // App utilities
  typedHandle(
    IPC_CHANNELS.APP_OPEN_EXTERNAL,
    async (
      event,
      url: IpcRequest<typeof IPC_CHANNELS.APP_OPEN_EXTERNAL>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.APP_OPEN_EXTERNAL>> => {
      if (!validateSender(event)) return;
      try {
        if (typeof url === "string" && isAllowedMeetUrl(url)) {
          await shell.openExternal(url);
        }
      } catch (err) {
        console.error("[ipc] APP_OPEN_EXTERNAL error:", err);
      }
    },
  );

  typedHandle(
    IPC_CHANNELS.APP_GET_VERSION,
    (event): IpcResponse<typeof IPC_CHANNELS.APP_GET_VERSION> => {
      if (!validateSender(event)) return "";
      try {
        return app.getVersion();
      } catch (err) {
        console.error("[ipc] APP_GET_VERSION error:", err);
        return "";
      }
    },
  );

  // Settings
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
      return updated;
    },
  );

}
