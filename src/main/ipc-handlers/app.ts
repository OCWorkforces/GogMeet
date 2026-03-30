import { shell, app } from "electron";
import { IPC_CHANNELS, type IpcRequest, type IpcResponse } from "../../shared/ipc-channels.js";
import { isAllowedMeetUrl } from "../utils/url-validation.js";
import { validateSender, typedHandle } from "./shared.js";

export function registerAppHandlers(): void {
  typedHandle(
    IPC_CHANNELS.APP_OPEN_EXTERNAL,
    async (
      event,
      url: IpcRequest<typeof IPC_CHANNELS.APP_OPEN_EXTERNAL>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.APP_OPEN_EXTERNAL>> => {
      if (!validateSender(event)) return;
      try {
        if (typeof url === "string" && isAllowedMeetUrl(url)) {
          await shell.openExternal(url);
        }
      } catch (err) {
        console.error("[ipc] APP_OPEN_EXTERNAL error:", err);
      }
    },
  );

  typedHandle(
    IPC_CHANNELS.APP_GET_VERSION,
    (event): IpcResponse<typeof IPC_CHANNELS.APP_GET_VERSION> => {
      if (!validateSender(event)) return "";
      try {
        return app.getVersion();
      } catch (err) {
        console.error("[ipc] APP_GET_VERSION error:", err);
        return "";
      }
    },
  );
}
