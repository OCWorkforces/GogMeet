import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types.js';
import type { MeetingEvent, CalendarPermission } from '../shared/types.js';

const api = {
  calendar: {
    getEvents: (): Promise<MeetingEvent[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_GET_EVENTS),

    requestPermission: (): Promise<CalendarPermission> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION),

    getPermissionStatus: (): Promise<CalendarPermission> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_PERMISSION_STATUS),
  },

  window: {
    minimizeToTray: (): void =>
      ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE_TO_TRAY),

    restore: (): void =>
      ipcRenderer.send(IPC_CHANNELS.WINDOW_RESTORE),
  },

  app: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),

    getVersion: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
