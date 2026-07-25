import { app, type IpcMainInvokeEvent } from "electron";
import { asEventId, asMeetUrl } from "../../shared/brand.js";
import { IPC_CHANNELS, type IpcRequest, type IpcResponse } from "../../shared/ipc-channels.js";
import { err } from "../../shared/result.js";
import { joinMeetingById } from "../utils/join-meeting.js";
import { openMeetingUrl } from "../utils/meet-url.js";
import { typedHandle, validateSender } from "./shared.js";

export function registerAppHandlers(): void {
  typedHandle(
    IPC_CHANNELS.APP_OPEN_EXTERNAL,
    async (
      event: IpcMainInvokeEvent,
      payload: IpcRequest<typeof IPC_CHANNELS.APP_OPEN_EXTERNAL>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.APP_OPEN_EXTERNAL>> => {
      if (!validateSender(event)) return err("Unauthorized");
      const raw = payload?.url;
      if (typeof raw !== "string") return err("Invalid URL payload");
      // Re-validate at the main trust boundary (do not trust preload brand alone)
      const branded = asMeetUrl(raw);
      if (!branded.ok) return err(branded.error);
      return openMeetingUrl(branded.value);
    },
  );

  typedHandle(
    IPC_CHANNELS.APP_JOIN_MEETING,
    async (
      event: IpcMainInvokeEvent,
      payload: IpcRequest<typeof IPC_CHANNELS.APP_JOIN_MEETING>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.APP_JOIN_MEETING>> => {
      if (!validateSender(event)) return err("Unauthorized");
      const raw = payload?.id;
      if (typeof raw !== "string") return err("Invalid event id");
      const branded = asEventId(raw);
      if (!branded.ok) return err(branded.error);
      return joinMeetingById(branded.value);
    },
  );

  typedHandle(
    IPC_CHANNELS.APP_GET_VERSION,
    (event: IpcMainInvokeEvent): IpcResponse<typeof IPC_CHANNELS.APP_GET_VERSION> => {
      if (!validateSender(event)) return "";
      try {
        return app.getVersion();
      } catch (e) {
        console.error("[ipc] APP_GET_VERSION error:", e);
        return "";
      }
    },
  );
}
