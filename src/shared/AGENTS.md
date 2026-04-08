# Shared — Cross-Process Contracts

Type definitions and utilities shared across main, preload, and renderer processes. Single source of truth for IPC channels and data models.

## FILES

| File                   | Role                                                                              |
| ---------------------- | --------------------------------------------------------------------------------- |
| `ipc-channels.ts`      | IPC channel constants, IpcChannelMap, IpcRequest/IpcResponse type utilities       |
| `models.ts`            | MeetingEvent, CalendarResult, CalendarPermission                                  |
| `settings.ts`          | AppSettings, DEFAULT_SETTINGS, min/max constants                                  |
| `utils/escape-html.ts` | XSS protection utility (used by main popover + alert)                             |
| `utils/time.ts`        | `isTomorrow`, `formatMeetingTime`, `formatRemainingTime` — shared time formatting |

## IPC CHANNELS (`ipc-channels.ts`)

```typescript
export const IPC_CHANNELS = {
  CALENDAR_GET_EVENTS: "calendar:get-events",
  CALENDAR_REQUEST_PERMISSION: "calendar:request-permission",
  CALENDAR_PERMISSION_STATUS: "calendar:permission-status",
  WINDOW_SET_HEIGHT: "window:set-height",
  APP_OPEN_EXTERNAL: "app:open-external",
  APP_GET_VERSION: "app:get-version",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  SETTINGS_CHANGED: "settings:changed", // push: main → renderer
  CALENDAR_EVENTS_UPDATED: "calendar:events-updated", // push: main → renderer
  ALERT_SHOW: "alert:show", // push: main → renderer
} as const;
```

`IpcChannelMap` (ipc-channels.ts:24) maps each **invoke** channel to its `request` / `response` types.

**Push channels** (`SETTINGS_CHANGED`, `CALENDAR_EVENTS_UPDATED`, `ALERT_SHOW`) are send-only — main → renderer via `win.webContents.send()`. Not in `IpcChannelMap` request/response types.

## DATA MODELS (`models.ts`)

### MeetingEvent

```typescript
export interface MeetingEvent {
  id: string;
  title: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  meetUrl?: string; // meet.google.com/xxx-xxxx-xxx
  calendarName: string;
  isAllDay: boolean;
  userEmail?: string; // Google email from EventKit attendee
  description?: string; // Event notes from macOS Calendar
}
```

### CalendarResult

```typescript
export type CalendarResult = { events: MeetingEvent[] } | { error: string };
```

### CalendarPermission

```typescript
export type CalendarPermission = "granted" | "denied" | "not-determined";
```

## SETTINGS (`settings.ts`)

```typescript
export interface AppSettings {
  schemaVersion: number; // Settings migration version
  openBeforeMinutes: number; // 1-5, default 1
  launchAtLogin: boolean; // macOS login item toggle
  showTomorrowMeetings: boolean; // Show tomorrow in tray menu
  windowAlert: boolean; // Show full-screen overlay
}

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

## TIME UTILITIES (`utils/time.ts`)

| Function              | Signature                 | Role                                   |
| --------------------- | ------------------------- | -------------------------------------- |
| `isTomorrow`          | `(date: Date) => boolean` | Date comparison for tomorrow check     |
| `formatMeetingTime`   | `(date: Date) => string`  | HH:MM formatting for meeting times     |
| `formatRemainingTime` | `(ms: number) => string`  | "X min" / "Xh Ym" countdown formatting |

## TYPE UTILITIES (`ipc-channels.ts`)

```typescript
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type IpcRequest<K extends IpcChannel> = IpcChannelMap[K]["request"];
export type IpcResponse<K extends IpcChannel> = IpcChannelMap[K]["response"];
```

## USAGE PATTERN

1. **Add new channel**: Add to `IPC_CHANNELS` in `ipc-channels.ts`, add request/response types to discriminated unions
2. **Add new data type**: Define interface/type in `models.ts` or `settings.ts`
3. **Use in processes**: `import { ... } from '../shared/ipc-channels.js'` (or `models.js`, `settings.js`)

## IMPORT PATHS

| Process  | Import Path           |
| -------- | --------------------- |
| main     | `../shared/<file>.js` |
| preload  | `../shared/<file>.js` |
| renderer | `../shared/<file>.js` |

Note: `.js` extension required for ESM resolution even though source is `.ts`.
