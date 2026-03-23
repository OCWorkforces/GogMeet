# Shared Types — Cross-Process Contracts

Type definitions shared across main, preload, and renderer processes. Single source of truth for IPC channels and data models.

## FILES

| File                   | Role                                  |
| ---------------------- | ------------------------------------- |
| `types.ts`             | IPC channels, interfaces, type unions |
| `utils/escape-html.ts` | XSS protection utility                |

## IPC CHANNELS

```typescript
// types.ts:2-14
export const IPC_CHANNELS = {
  CALENDAR_GET_EVENTS: "calendar:get-events",
  CALENDAR_REQUEST_PERMISSION: "calendar:request-permission",
  CALENDAR_PERMISSION_STATUS: "calendar:permission-status",
  WINDOW_SET_HEIGHT: "window:set-height",
  APP_OPEN_EXTERNAL: "app:open-external",
  APP_GET_VERSION: "app:get-version",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  SETTINGS_CHANGED: "settings:changed",
  CALENDAR_EVENTS_UPDATED: "calendar:events-updated",
  ALERT_SHOW: "alert:show",
} as const;
```

`IpcChannelMap` (types.ts:17) maps each **invoke** channel to its `request` / `response` types.

**Push channels** (`SETTINGS_CHANGED`, `CALENDAR_EVENTS_UPDATED`, `ALERT_SHOW`) are send-only — main → renderer via `win.webContents.send()`. Not in `IpcChannelMap`.

## DATA MODELS

### MeetingEvent

```typescript
// types.ts:25-33
export interface MeetingEvent {
  id: string;
  title: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  meetUrl?: string; // meet.google.com/xxx-xxxx-xxx (absent for non-Meet events)
  calendarName: string;
  isAllDay: boolean;
  userEmail?: string; // Current user's Google email from EventKit attendee list
}
```

### CalendarResult

```typescript
// types.ts:37
export type CalendarResult = { events: MeetingEvent[] } | { error: string };
```

### CalendarPermission

```typescript
// types.ts:40
export type CalendarPermission = "granted" | "denied" | "not-determined";
```

### AppSettings

```typescript
// types.ts:43-54
export interface AppSettings {
  schemaVersion: number; // Settings migration version
  openBeforeMinutes: number; // 1-5, default 1
  launchAtLogin: boolean; // macOS login item toggle
  showTomorrowMeetings: boolean; // show tomorrow's meetings in tray menu
  windowAlert: boolean; // show full-screen overlay instead of browser
}
```

### Constants

```typescript
// types.ts:57-67
export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  openBeforeMinutes: 1,
  launchAtLogin: false,
  showTomorrowMeetings: true,
  windowAlert: true,
};
export const OPEN_BEFORE_MINUTES_MIN = 1;
export const OPEN_BEFORE_MINUTES_MAX = 5;
```

## TYPE UTILITIES

```typescript
// types.ts:71+
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type IpcRequest<K extends IpcChannel> = IpcChannelMap[K]["request"];
export type IpcResponse<K extends IpcChannel> = IpcChannelMap[K]["response"];
```

## USAGE PATTERN

1. **Add new channel**: Add to `IPC_CHANNELS` object
2. **Add new data type**: Define interface/type export
3. **Use in processes**: `import { ... } from '../shared/types.js'`

## IMPORT PATHS

| Process  | Import Path          |
| -------- | -------------------- |
| main     | `../shared/types.js` |
| preload  | `../shared/types.js` |
| renderer | `../shared/types.js` |

Note: `.js` extension required for ESM resolution even though source is `.ts`.
