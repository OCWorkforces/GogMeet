import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types.js";
import type { IpcRequest, IpcResponse, AppSettings, MeetingEvent } from "../shared/types.js";

const api = {
  calendar: {
    getEvents: (): Promise<
      IpcResponse<typeof IPC_CHANNELS.CALENDAR_GET_EVENTS>
    > => ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_GET_EVENTS),

    requestPermission: (): Promise<
      IpcResponse<typeof IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION>
    > => ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION),

    getPermissionStatus: (): Promise<
      IpcResponse<typeof IPC_CHANNELS.CALENDAR_PERMISSION_STATUS>
    > => ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_PERMISSION_STATUS),

    onEventsUpdated: (callback: () => void): (() => void) => {
      const handler = (): void => {
        callback();
      };
      ipcRenderer.on(IPC_CHANNELS.CALENDAR_EVENTS_UPDATED, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CALENDAR_EVENTS_UPDATED, handler);
      };
    },
  },

  window: {
    setHeight: (
      height: IpcRequest<typeof IPC_CHANNELS.WINDOW_SET_HEIGHT>,
    ): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_SET_HEIGHT, height),
  },

  app: {
    openExternal: (
      url: IpcRequest<typeof IPC_CHANNELS.APP_OPEN_EXTERNAL>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.APP_OPEN_EXTERNAL>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),

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
    onShowAlert: (callback: (data: MeetingEvent) => void) =>
      ipcRenderer.on(IPC_CHANNELS.ALERT_SHOW, (_event, data) => callback(data)),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
