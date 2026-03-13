import type { AppSettings, CalendarPermission, CalendarResult } from "../shared/types.js";

declare global {
  interface Window {
    api: {
      calendar: {
        getEvents(): Promise<CalendarResult>;
        requestPermission(): Promise<CalendarPermission>;
        getPermissionStatus(): Promise<CalendarPermission>;
      };
      window: {
        setHeight(height: number): void;
      };
      app: {
        openExternal(url: string): Promise<void>;
        getVersion(): Promise<string>;
      };
      settings: {
        get(): Promise<AppSettings>;
        set(partial: Partial<AppSettings>): Promise<AppSettings>;
      };
    };
  }
}

export {};
