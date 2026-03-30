import { IPC_CHANNELS, type IpcResponse } from "../../shared/ipc-channels.js";
import {
  getCalendarEventsResult,
  requestCalendarPermission,
  getCalendarPermissionStatus,
} from "../calendar.js";
import { validateSender, typedHandle } from "./shared.js";

export function registerCalendarHandlers(): void {
  typedHandle(
    IPC_CHANNELS.CALENDAR_GET_EVENTS,
    async (
      event,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_GET_EVENTS>> => {
      if (!validateSender(event)) return { error: "unauthorized" };
      try {
        return await getCalendarEventsResult();
      } catch (err) {
        console.error("[ipc] CALENDAR_GET_EVENTS error:", err);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  typedHandle(
    IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION,
    async (
      event,
    ): Promise<
      IpcResponse<typeof IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION>
    > => {
      if (!validateSender(event)) return "denied";
      try {
        return await requestCalendarPermission();
      } catch (err) {
        console.error("[ipc] CALENDAR_REQUEST_PERMISSION error:", err);
        return "denied";
      }
    },
  );

  typedHandle(
    IPC_CHANNELS.CALENDAR_PERMISSION_STATUS,
    async (
      event,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_PERMISSION_STATUS>> => {
      if (!validateSender(event)) return "denied";
      try {
        return await getCalendarPermissionStatus();
      } catch (err) {
        console.error("[ipc] CALENDAR_PERMISSION_STATUS error:", err);
        return "denied";
      }
    },
  );
}
