import type { CalendarResult, CalendarPermission } from "./models.js";
import type { AppSettings } from "./settings.js";
import type { AlertPayload } from "./alert.js";

/** IPC channel names — single source of truth */
export const IPC_CHANNELS = {
  CALENDAR_GET_EVENTS: "calendar:get-events",
  CALENDAR_REQUEST_PERMISSION: "calendar:request-permission",
  CALENDAR_PERMISSION_STATUS: "calendar:permission-status",
  WINDOW_SET_HEIGHT: "window:set-height",
  APP_OPEN_EXTERNAL: "app:open-external",
  APP_GET_VERSION: "app:get-version",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  SETTINGS_CHANGED: "settings:changed",
  CALENDAR_EVENTS_UPDATED: "calendar:events-updated",
  ALERT_SHOW: "alert:show",
} as const satisfies Record<string, string>;

// ─── Type utilities for IPC ──────────────────────────────────────────────────

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/**
 * IPC invoke channel map — single source of truth for request/response types.
 * Each entry maps a channel string to its `{ request; response }` payload types.
 */
export interface IpcChannelMap {
  [IPC_CHANNELS.CALENDAR_GET_EVENTS]: { request: void; response: CalendarResult };
  [IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION]: { request: void; response: CalendarPermission };
  [IPC_CHANNELS.CALENDAR_PERMISSION_STATUS]: { request: void; response: CalendarPermission };
  [IPC_CHANNELS.WINDOW_SET_HEIGHT]: { request: number; response: void };
  [IPC_CHANNELS.APP_OPEN_EXTERNAL]: { request: string; response: void };
  [IPC_CHANNELS.APP_GET_VERSION]: { request: void; response: string };
  [IPC_CHANNELS.SETTINGS_GET]: { request: void; response: AppSettings };
  [IPC_CHANNELS.SETTINGS_SET]: { request: Partial<AppSettings>; response: AppSettings };
}

/** Type-safe IPC request/response derived from the channel map */
export type IpcRequest<K extends keyof IpcChannelMap> = IpcChannelMap[K]["request"];
export type IpcResponse<K extends keyof IpcChannelMap> = IpcChannelMap[K]["response"];

// ─── Push channels: main → renderer (webContents.send) ──────────────────────

/** Push channel payload type map for type-safe webContents.send */
export interface PushChannelMap {
  [IPC_CHANNELS.ALERT_SHOW]: AlertPayload;
  [IPC_CHANNELS.SETTINGS_CHANGED]: AppSettings;
  [IPC_CHANNELS.CALENDAR_EVENTS_UPDATED]: void;
}
