# Shared Types — Cross-Process Contracts

Type definitions shared across main, preload, and renderer processes. Single source of truth for IPC channels and data models.

## FILES

| File       | Role                                  |
| ---------- | ------------------------------------- |
| `types.ts` | IPC channels, interfaces, type unions |

## IPC CHANNELS

```typescript
// types.ts:2-10
export const IPC_CHANNELS = {
  CALENDAR_GET_EVENTS: "calendar:get-events",
  CALENDAR_REQUEST_PERMISSION: "calendar:request-permission",
  CALENDAR_PERMISSION_STATUS: "calendar:permission-status",
  WINDOW_MINIMIZE_TO_TRAY: "window:minimize-to-tray",
  WINDOW_RESTORE: "window:restore",
  APP_OPEN_EXTERNAL: "app:open-external",
  APP_GET_VERSION: "app:get-version",
} as const;
```

## DATA MODELS

### MeetingEvent

```typescript
// types.ts:15-26
export interface MeetingEvent {
  id: string;
  title: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  meetUrl: string; // meet.google.com/xxx-xxxx-xxx
  calendarName: string;
  location?: string;
  notes?: string;
  isAllDay: boolean;
  userEmail?: string; // Extracted from EKParticipant (self attendee)
}
```

### CalendarPermission

```typescript
// types.ts:28-32
export type CalendarPermission =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted";
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

## CALENDAR RESULT TYPE

```typescript
// types.ts:24-26
export type CalendarResult =
  | { events: MeetingEvent[] }
  | { error: string };
```

Returned by `getCalendarEventsResult()` — distinguishes success vs failure.
