import type { IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS, type IpcResponse } from "../../shared/ipc-channels.js";
import type { AppGraph } from "../composition/app-graph.js";
import { defaultCalendarUiState } from "../../domain/entities/calendar-ui-state.js";
import { validateSender, typedHandle } from "./shared.js";

export function registerCalendarHandlers(graph: AppGraph): void {
  typedHandle(
    IPC_CHANNELS.CALENDAR_GET_EVENTS,
    async (
      event: IpcMainInvokeEvent,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.CALENDAR_GET_EVENTS>> => {
      if (!validateSender(event)) {
        return {
          publicationGeneration: 0,
          result: { kind: "err", error: "unauthorized", code: "unknown" },
        };
      }
      try {
        // Coordinated refresh: publication envelope for renderer generation tracking.
        return await graph.calendar.getEvents();
      } catch (err) {
        console.error("[ipc] CALENDAR_GET_EVENTS error:", err);
        return {
          publicationGeneration: 0,
          result: {
            kind: "err",
            error: err instanceof Error ? err.message : String(err),
            code: "unknown",
          },
        };
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
        const status = await graph.calendar.requestPermission();
        if (status === "granted") {
          void graph.scheduler.forcePoll();
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
        return await graph.calendar.getPermissionStatus();
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
        await graph.calendar.disconnect();
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
        return graph.calendar.getUiState();
      } catch (err) {
        console.error("[ipc] CALENDAR_UI_STATE error:", err);
        return defaultCalendarUiState();
      }
    },
  );
}
