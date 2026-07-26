import type { IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS, type IpcResponse } from "../../shared/ipc-channels.js";
import {
  getCalendarEventsResult,
  requestCalendarPermission,
  getCalendarPermissionStatus,
  disconnectCalendar,
  getCalendarUiState,
} from "../domain/calendar.js";
import { forcePoll } from "../scheduler/facade.js";
import { defaultCalendarUiState } from "../../shared/calendar-ui-state.js";
import { validateSender, typedHandle } from "./shared.js";

export function registerCalendarHandlers(): void {
  typedHandle(
    IPC_CHANNELS.CALENDAR_GET_EVENTS,
    async (
      event: IpcMainInvokeEvent,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_GET_EVENTS>> => {
      if (!validateSender(event)) return { kind: "err", error: "unauthorized" };
      try {
        return await getCalendarEventsResult();
      } catch (err) {
        console.error("[ipc] CALENDAR_GET_EVENTS error:", err);
        return { kind: "err", error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  typedHandle(
    IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION,
    async (
      event: IpcMainInvokeEvent,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION>> => {
      if (!validateSender(event)) return "denied";
      try {
        const status = await requestCalendarPermission();
        if (status === "granted") {
          void forcePoll();
        }
        return status;
      } catch (err) {
        console.error("[ipc] CALENDAR_REQUEST_PERMISSION error:", err);
        return "denied";
      }
    },
  );

  typedHandle(
    IPC_CHANNELS.CALENDAR_PERMISSION_STATUS,
    async (
      event: IpcMainInvokeEvent,
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

  typedHandle(
    IPC_CHANNELS.CALENDAR_DISCONNECT,
    async (
      event: IpcMainInvokeEvent,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_DISCONNECT>> => {
      if (!validateSender(event)) return;
      try {
        await disconnectCalendar();
      } catch (err) {
        console.error("[ipc] CALENDAR_DISCONNECT error:", err);
      }
    },
  );

  typedHandle(
    IPC_CHANNELS.CALENDAR_UI_STATE,
    async (
      event: IpcMainInvokeEvent,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_UI_STATE>> => {
      if (!validateSender(event)) return defaultCalendarUiState();
      try {
        return getCalendarUiState();
      } catch (err) {
        console.error("[ipc] CALENDAR_UI_STATE error:", err);
        return defaultCalendarUiState();
      }
    },
  );
}
