import {
  ipcMain,
  shell,
  app,
  BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
import { IPC_CHANNELS } from "../shared/types.js";
import {
  getCalendarEventsResult,
  requestCalendarPermission,
  getCalendarPermissionStatus,
} from "./calendar.js";

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

/** Allowlisted Meet URL prefixes */
const MEET_URL_ALLOWLIST = [
  "https://meet.google.com/",
  "https://calendar.google.com/",
  "https://accounts.google.com/",
];

export function isAllowedMeetUrl(url: string): boolean {
  return MEET_URL_ALLOWLIST.some((prefix) => url.startsWith(prefix));
}

export function registerIpcHandlers(win: BrowserWindow): void {
  // Calendar
  ipcMain.handle(IPC_CHANNELS.CALENDAR_GET_EVENTS, async (event) => {
    if (!validateSender(event)) return { error: "unauthorized" };
    try {
      return await getCalendarEventsResult();
    } catch (err) {
      console.error("[ipc] CALENDAR_GET_EVENTS error:", err);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION, async (event) => {
    if (!validateSender(event)) return "denied";
    try {
      return await requestCalendarPermission();
    } catch (err) {
      console.error("[ipc] CALENDAR_REQUEST_PERMISSION error:", err);
      return "denied";
    }
  });

  ipcMain.handle(IPC_CHANNELS.CALENDAR_PERMISSION_STATUS, async (event) => {
    if (!validateSender(event)) return "denied";
    try {
      return await getCalendarPermissionStatus();
    } catch (err) {
      console.error("[ipc] CALENDAR_PERMISSION_STATUS error:", err);
      return "denied";
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_SET_HEIGHT, (event, height: number) => {
    // Validate sender (inline check for ipcMain.on which uses IpcMainEvent)
    const senderUrl = event.senderFrame?.url ?? "";
    const isAllowed =
      senderUrl.startsWith("file://") ||
      [...ALLOWED_ORIGINS].some((o) => senderUrl.startsWith(o));
    if (!isAllowed) {
      console.warn("[ipc] WINDOW_SET_HEIGHT from unauthorized sender:", senderUrl);
      return;
    }

    try {
      if (typeof height === "number" && height > 0) {
        // Clamp height to acceptable bounds
        const clampedHeight = Math.max(MIN_WINDOW_HEIGHT, Math.min(MAX_WINDOW_HEIGHT, Math.round(height)));
        win.setSize(360, clampedHeight, true);
      }
    } catch (err) {
      console.error("[ipc] WINDOW_SET_HEIGHT error:", err);
    }
  });

  // App utilities
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (event, url: string) => {
    if (!validateSender(event)) return;
    try {
      if (typeof url === "string" && isAllowedMeetUrl(url)) {
        await shell.openExternal(url);
      }
    } catch (err) {
      console.error("[ipc] APP_OPEN_EXTERNAL error:", err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, (event) => {
    if (!validateSender(event)) return "";
    try {
      return app.getVersion();
    } catch (err) {
      console.error("[ipc] APP_GET_VERSION error:", err);
      return "";
    }
  });
}
