/** IPC channel names — single source of truth */
export const IPC_CHANNELS = {
  CALENDAR_GET_EVENTS: 'calendar:get-events',
  CALENDAR_REQUEST_PERMISSION: 'calendar:request-permission',
  CALENDAR_PERMISSION_STATUS: 'calendar:permission-status',
  WINDOW_MINIMIZE_TO_TRAY: 'window:minimize-to-tray',
  WINDOW_RESTORE: 'window:restore',
  APP_OPEN_EXTERNAL: 'app:open-external',
  APP_GET_VERSION: 'app:get-version',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Meeting event data model */
export interface MeetingEvent {
  id: string;
  title: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  meetUrl: string; // meet.google.com/xxx-xxxx-xxx
  calendarName: string;
  location?: string;
  notes?: string;
  isAllDay: boolean;
  userEmail?: string; // Current user's Google email from EventKit attendee list
}

/** Calendar permission states */
export type CalendarPermission =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted';
