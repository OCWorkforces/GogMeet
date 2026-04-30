import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type IpcRequest, type IpcResponse } from "../shared/ipc-channels.js";
import type { AlertPayload } from "../shared/alert.js";
import type { AppSettings } from "../shared/settings.js";
import type { MeetingEvent } from "../shared/models.js";
import { asMeetUrl, clampWindowHeight, type MeetUrl } from "../shared/brand.js";

/** Hostnames the renderer is permitted to ask the main process to open. */
const MEET_URL_ALLOWED_HOSTNAMES: readonly string[] = [
  "meet.google.com",
  "calendar.google.com",
  "accounts.google.com",
];

function brandMeetUrl(raw: string): MeetUrl | null {
  const branded = asMeetUrl(raw);
  if (!branded.ok) return null;
  let parsed: URL;
  try {
    parsed = new URL(branded.value);
  } catch {
    return null;
  }
  if (!MEET_URL_ALLOWED_HOSTNAMES.includes(parsed.hostname)) return null;
  return branded.value;
}

const api = {
  calendar: {
    getEvents: (): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_GET_EVENTS>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_GET_EVENTS),

    requestPermission: (): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION),

    getPermissionStatus: (): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_PERMISSION_STATUS>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_PERMISSION_STATUS),

    onEventsUpdated: (callback: (events: MeetingEvent[]) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, events: MeetingEvent[]): void => {
        callback(events);
      };
      ipcRenderer.on(IPC_CHANNELS.CALENDAR_EVENTS_UPDATED, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CALENDAR_EVENTS_UPDATED, handler);
      };
    },
  },

  window: {
    setHeight: (height: number): void => {
      const clampedHeight = clampWindowHeight(height);
      ipcRenderer.send(IPC_CHANNELS.WINDOW_SET_HEIGHT, { height: clampedHeight });
    },
  },

  app: {
    openExternal: (url: string): Promise<IpcResponse<typeof IPC_CHANNELS.APP_OPEN_EXTERNAL>> => {
      const branded = brandMeetUrl(url);
      if (branded === null) return Promise.resolve();
      return ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, { url: branded });
    },

    getVersion: (): Promise<IpcResponse<typeof IPC_CHANNELS.APP_GET_VERSION>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  },

  settings: {
    get: (): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

    set: (
      partial: IpcRequest<typeof IPC_CHANNELS.SETTINGS_SET>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_SET>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, partial),

    onChanged: (callback: (settings: AppSettings) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, settings: AppSettings): void => {
        callback(settings);
      };
      ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, handler);
      };
    },
  },

  alert: {
    onShowAlert: (callback: (data: AlertPayload) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: AlertPayload): void => {
        callback(data);
      };
      ipcRenderer.on(IPC_CHANNELS.ALERT_SHOW, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ALERT_SHOW, handler);
      };
    },
  },

  scheduler: {
    forcePoll: (): void => ipcRenderer.send(IPC_CHANNELS.SCHEDULER_FORCE_POLL),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
