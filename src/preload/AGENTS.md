# Preload Script — Context Bridge

Electron preload (sandboxed). Bridges main and renderer via `contextBridge`. Exposes safe API as `window.api`.

## FILES

| File            | Role                             |
| --------------- | -------------------------------- |
| `index.ts`      | Context bridge API definition    |
| `tsconfig.json` | TypeScript config (extends root) |

## API STRUCTURE

```typescript
// index.ts:5-30
const api = {
  calendar: {
    getEvents: (): Promise<CalendarResult> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CALENDAR_GET_EVENTS,
      ) as Promise<CalendarResult>,

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
