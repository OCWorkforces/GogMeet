import { ipcMain, shell, app, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/types.js';
import { getCalendarEvents, requestCalendarPermission, getCalendarPermissionStatus } from './calendar.js';

export function registerIpcHandlers(win: BrowserWindow): void {
  // Calendar
  ipcMain.handle(IPC_CHANNELS.CALENDAR_GET_EVENTS, async () => {
    return getCalendarEvents();
  });

  ipcMain.handle(IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION, async () => {
    return requestCalendarPermission();
  });

  ipcMain.handle(IPC_CHANNELS.CALENDAR_PERMISSION_STATUS, async () => {
    return getCalendarPermissionStatus();
  });

  // Window management
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE_TO_TRAY, () => {
    win.hide();
    app.dock?.hide();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_RESTORE, () => {
    win.show();
    win.focus();
  });

  // App utilities
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_event, url: string) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion();
  });
}
