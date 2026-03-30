import type { CalendarResult, CalendarPermission } from "./models.js";
import type { AppSettings } from "./settings.js";

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
} as const;

// ─── Type utilities for IPC ──────────────────────────────────────────────────

type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** IPC Request/Response type map for type-safe IPC */
export type IpcChannelMap = {
  [K in IpcChannel]: {
    request: IpcChannelRequest<K>;
    response: IpcChannelResponse<K>;
  };
};

type IpcChannelRequest<C extends IpcChannel> =
  C extends typeof IPC_CHANNELS.CALENDAR_GET_EVENTS
    ? void
    : C extends typeof IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION
      ? void
      : C extends typeof IPC_CHANNELS.CALENDAR_PERMISSION_STATUS
        ? void
        : C extends typeof IPC_CHANNELS.WINDOW_SET_HEIGHT
          ? number
          : C extends typeof IPC_CHANNELS.APP_OPEN_EXTERNAL
            ? string
            : C extends typeof IPC_CHANNELS.APP_GET_VERSION
              ? void
              : C extends typeof IPC_CHANNELS.SETTINGS_GET
                ? void
                : C extends typeof IPC_CHANNELS.SETTINGS_SET
                  ? Partial<AppSettings>
                  : never;

type IpcChannelResponse<C extends IpcChannel> =
  C extends typeof IPC_CHANNELS.CALENDAR_GET_EVENTS
    ? CalendarResult
    : C extends typeof IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION
      ? CalendarPermission
      : C extends typeof IPC_CHANNELS.CALENDAR_PERMISSION_STATUS
        ? CalendarPermission
        : C extends typeof IPC_CHANNELS.WINDOW_SET_HEIGHT
          ? void
          : C extends typeof IPC_CHANNELS.APP_OPEN_EXTERNAL
            ? void
            : C extends typeof IPC_CHANNELS.APP_GET_VERSION
              ? string
              : C extends typeof IPC_CHANNELS.SETTINGS_GET
                ? AppSettings
                : C extends typeof IPC_CHANNELS.SETTINGS_SET
                  ? AppSettings
                  : never;

/** Type-safe IPC request/response */
export type IpcRequest<C extends IpcChannel> = IpcChannelRequest<C>;
export type IpcResponse<C extends IpcChannel> = IpcChannelResponse<C>;
