import type { MeetingEvent, CalendarPermission } from '../shared/types.js';

declare global {
  interface Window {
    api: {
      calendar: {
        getEvents(): Promise<MeetingEvent[]>;
        requestPermission(): Promise<CalendarPermission>;
        getPermissionStatus(): Promise<CalendarPermission>;
      };
      window: {
        minimizeToTray(): void;
        restore(): void;
      };
      app: {
        openExternal(url: string): Promise<void>;
        getVersion(): Promise<string>;
      };
    };
  }
}

export {};
