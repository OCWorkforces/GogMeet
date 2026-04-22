# Preload Script — Context Bridge

Electron preload (sandboxed). Bridges main and renderer via `contextBridge`. Exposes safe API as `window.api`.

## FILES

| File            | Role                             |
| --------------- | -------------------------------- |
| `index.ts`      | Context bridge API definition    |
| `tsconfig.json` | TypeScript config (extends root) |

## API STRUCTURE

```typescript
// index.ts
const api = {
  calendar: {
    getEvents: (): Promise<CalendarResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_GET_EVENTS) as Promise<CalendarResult>,
    requestPermission: (): Promise<CalendarPermission> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION),
    getPermissionStatus: (): Promise<CalendarPermission> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_PERMISSION_STATUS),
  },
  window: {
    setHeight: (height: number): void =>
      ipcRenderer.send(IPC_CHANNELS.WINDOW_SET_HEIGHT, height),
  },
  app: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  },
  settings: {
    get: (): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    set: (partial: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, partial),
    onChanged: (callback: (settings: AppSettings) => void) => {
      ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, (_event, settings) => callback(settings));
  },
  alert: {
    onShowAlert: (callback: (data: AlertPayload) => void): () => void => {
      // Returns cleanup function, unlike previous void return
      const handler = (_event: IpcRendererEvent, data: AlertPayload) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.ALERT_SHOW, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.ALERT_SHOW, handler);
    },
  },
};
```

All push listeners (`onEventsUpdated`, `onChanged`, `onShowAlert`) now return cleanup functions that unregister the underlying `ipcRenderer` handler.

## EXPOSE

```typescript
contextBridge.exposeInMainWorld("api", api);
```

## TYPE EXPORT

```typescript
export type Api = typeof api;
```

## BUILD CONSTRAINT

**CRITICAL**: Electron must NEVER be bundled in preload.

Handled in `rslib.config.preload.ts:22-33`:

```javascript
// rspack externals function
if (req === "electron" || req.startsWith("electron/")) {
  return callback(undefined, `commonjs ${req}`);
}
```

## CHANNEL IMPORT

Channels imported from `../shared/ipc-channels.js`, `../shared/models.js`, `../shared/settings.js`, `../shared/alert.js` (single sources of truth).
