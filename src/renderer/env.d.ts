import type { AppSettings } from "../shared/settings.js";
import type { CalendarPermission, CalendarResult } from "../shared/models.js";
import type { AlertPayload } from "../shared/alert.js";

declare global {
  interface Window {
    api: {
      calendar: {
        getEvents(): Promise<CalendarResult>;
        requestPermission(): Promise<CalendarPermission>;
        getPermissionStatus(): Promise<CalendarPermission>;
        onEventsUpdated(callback: () => void): () => void;
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
        onChanged(callback: (settings: AppSettings) => void): () => void;
      };
      alert: {
        onShowAlert(callback: (data: AlertPayload) => void): () => void;
      };
    };
  }
}

export {};
