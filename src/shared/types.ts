/**
 * Shared types — re-export barrel for backward compatibility.
 *
 * Prefer importing from focused modules directly:
 *   - IPC_CHANNELS → ./ipc-channels.js
 *   - MeetingEvent, CalendarResult, CalendarPermission → ./models.js
 *   - AppSettings, DEFAULT_SETTINGS → ./settings.js
 *   - IpcChannelMap, IpcRequest, IpcResponse → ./ipc-types.js
 */

export { IPC_CHANNELS } from "./ipc-channels.js";
export type {
  MeetingEvent,
  CalendarResult,
  CalendarPermission,
} from "./models.js";
export type { AppSettings } from "./settings.js";
export {
  DEFAULT_SETTINGS,
  OPEN_BEFORE_MINUTES_MIN,
  OPEN_BEFORE_MINUTES_MAX,
} from "./settings.js";
export type { IpcChannelMap, IpcRequest, IpcResponse } from "./ipc-types.js";
