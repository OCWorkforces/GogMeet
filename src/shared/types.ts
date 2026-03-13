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
} as const;

/** IPC Request/Response type map for type-safe IPC */
export type IpcChannelMap = {
  [IPC_CHANNELS.CALENDAR_GET_EVENTS]: {
    request: void;
    response: CalendarResult;
  };
  [IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION]: {
    request: void;
    response: CalendarPermission;
  };
  [IPC_CHANNELS.CALENDAR_PERMISSION_STATUS]: {
    request: void;
    response: CalendarPermission;
  };
  [IPC_CHANNELS.WINDOW_SET_HEIGHT]: {
    request: number;
    response: void;
  };
  [IPC_CHANNELS.APP_OPEN_EXTERNAL]: {
    request: string;
    response: void;
  };
  [IPC_CHANNELS.APP_GET_VERSION]: {
    request: void;
    response: string;
  };
  [IPC_CHANNELS.SETTINGS_GET]: {
    request: void;
    response: AppSettings;
  };
  [IPC_CHANNELS.SETTINGS_SET]: {
    request: Partial<AppSettings>;
    response: AppSettings;
  };
};

/** Type utilities for type-safe IPC */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type IpcRequest<K extends IpcChannel> = IpcChannelMap[K]["request"];
export type IpcResponse<K extends IpcChannel> = IpcChannelMap[K]["response"];

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
}

/** Structured result from calendar fetch — either events or an error message */
export type CalendarResult = { events: MeetingEvent[] } | { error: string };

/** Calendar permission states */
export type CalendarPermission = "granted" | "denied" | "not-determined";

/** Application settings */
export interface AppSettings {
  /** Minutes before meeting start to auto-open browser (1-5) */
  openBeforeMinutes: number;
  /** Whether to launch the app at login (auto-start on system restart) */
  launchAtLogin: boolean;
  /** Whether to show tomorrow's meetings in the popover */
  showTomorrowMeetings: boolean;
}

/** Default settings values */
export const DEFAULT_SETTINGS: AppSettings = {
  openBeforeMinutes: 1,
  launchAtLogin: false,
  showTomorrowMeetings: true,
};

/** Valid range for openBeforeMinutes */
export const OPEN_BEFORE_MINUTES_MIN = 1;
export const OPEN_BEFORE_MINUTES_MAX = 5;
