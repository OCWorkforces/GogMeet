/** IPC channel names — single source of truth */
export const IPC_CHANNELS = {
  CALENDAR_GET_EVENTS: "calendar:get-events",
  CALENDAR_REQUEST_PERMISSION: "calendar:request-permission",
  CALENDAR_PERMISSION_STATUS: "calendar:permission-status",
  WINDOW_SET_HEIGHT: "window:set-height",
  APP_OPEN_EXTERNAL: "app:open-external",
  APP_GET_VERSION: "app:get-version",
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
}

/** Structured result from calendar fetch — either events or an error message */
export type CalendarResult = { events: MeetingEvent[] } | { error: string };

/** Calendar permission states */
export type CalendarPermission = "granted" | "denied" | "not-determined";
