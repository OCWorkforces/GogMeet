# Preload Script — Context Bridge

Electron preload (sandboxed). Bridges main and renderer via `contextBridge`. Exposes safe API as `window.api`.

## FILES

| File            | Role                             |
| --------------- | -------------------------------- |
| `index.ts`      | Context bridge API definition    |
| `tsconfig.json` | TypeScript config (extends root) |

## API STRUCTURE

```typescript
// index.ts:5-32
const api = {
  calendar: {
    getEvents: () => ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_GET_EVENTS),
    requestPermission: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION),
    getPermissionStatus: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_PERMISSION_STATUS),
  },
  window: {
    minimizeToTray: () =>
      ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE_TO_TRAY),
    restore: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_RESTORE),
  },
  app: {
    openExternal: (url) =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  },
};
```

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

Channels imported from `../shared/types.js` — single source of truth.

## TYPE EXPORT

```typescript
export type Api = typeof api;
```

Used by renderer for `window.api` type safety.
