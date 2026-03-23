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

/** IPC Request/Response type map for type-safe IPC */
export type IpcChannelMap = {
  [K in (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]]: {
    request: IpcChannelRequest<K>;
    response: IpcChannelResponse<K>;
  };
};

/** Meeting event data model */
export interface MeetingEvent {
  id: string;
  title: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  meetUrl?: string; // meet.google.com/xxx-xxxx-xxx (absent for non-Meet events)
  calendarName: string;
  isAllDay: boolean;
  userEmail?: string; // Current user's Google email from EventKit attendee list
  description?: string; // Event description/notes from macOS Calendar
}

/** Structured result from calendar fetch — either events or an error message */
export type CalendarResult = { events: MeetingEvent[] } | { error: string };

/** Calendar permission states */
export type CalendarPermission = "granted" | "denied" | "not-determined";

/** Application settings */
export interface AppSettings {
  /** Schema version for migrations */
  schemaVersion: number;
  /** Minutes before meeting start to auto-open browser (1-5) */
  openBeforeMinutes: number;
  /** Whether to launch the app at login (auto-start on system restart) */
  launchAtLogin: boolean;
  /** Whether to show tomorrow's meetings in the popover */
  showTomorrowMeetings: boolean;
  /** Whether to show a window alert when a meeting starts */
  windowAlert: boolean;
}

/** Default settings values */
export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  openBeforeMinutes: 1,
  launchAtLogin: false,
  showTomorrowMeetings: true,
  windowAlert: false,
};

/** Valid range for openBeforeMinutes */
export const OPEN_BEFORE_MINUTES_MIN = 1;
export const OPEN_BEFORE_MINUTES_MAX = 5;

// ─── Type utilities for IPC ──────────────────────────────────────────────────

type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

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
