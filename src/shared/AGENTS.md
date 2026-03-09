# Shared Types — Cross-Process Contracts

Type definitions shared across main, preload, and renderer processes. Single source of truth for IPC channels and data models.

## FILES

| File       | Role                                  |
| ---------- | ------------------------------------- |
| `types.ts` | IPC channels, interfaces, type unions |

## IPC CHANNELS

```typescript
// types.ts:2-9
export const IPC_CHANNELS = {
  CALENDAR_GET_EVENTS: "calendar:get-events",
  CALENDAR_REQUEST_PERMISSION: "calendar:request-permission",
  CALENDAR_PERMISSION_STATUS: "calendar:permission-status",
  WINDOW_SET_HEIGHT: "window:set-height",
  APP_OPEN_EXTERNAL: "app:open-external",
  APP_GET_VERSION: "app:get-version",
} as const;
```

## DATA MODELS

### MeetingEvent

```typescript
// types.ts:12-21
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
// types.ts:23-24
export type CalendarResult = { events: MeetingEvent[] } | { error: string };
```

### CalendarPermission

```typescript
// types.ts:26-30
export type CalendarPermission = "granted" | "denied" | "not-determined";
```

## TYPE UTILITIES

```typescript
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
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
