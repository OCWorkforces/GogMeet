import { globalShortcut, shell, dialog } from "electron";
import { getCalendarEventsResult } from "./calendar.js";
import { buildMeetUrl } from "./utils/meet-url.js";
import log from "electron-log";

let registered = false;

export function registerShortcuts(): void {
  if (registered) return;

  const ret = globalShortcut.register("CmdOrCtrl+Shift+M", async () => {
    log.info("[shortcuts] Cmd+Shift+M pressed — joining next meeting");
    try {
      const result = await getCalendarEventsResult();
      if ("error" in result) {
        log.warn("[shortcuts] No calendar access");
        return;
      }
      const now = Date.now();
      const nextMeeting = result.events
        .filter(
          (e) =>
            !e.isAllDay && !!e.meetUrl && new Date(e.startDate).getTime() > now,
        )
        .sort(
          (a, b) =>
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
        )[0];

      if (!nextMeeting) {
        log.info("[shortcuts] No upcoming meetings with URL");
        return;
      }

      const url = buildMeetUrl(nextMeeting);
      if (!url) {
        dialog.showErrorBox("GogMeet", "No meeting URL available");
        return;
      }
      void shell.openExternal(url);
    } catch (err) {
      log.error("[shortcuts] Failed to join meeting:", err);
    }
  });

  if (ret) {
    registered = true;
    log.info("[shortcuts] Registered Cmd+Shift+M");
  } else {
    log.warn("[shortcuts] Failed to register Cmd+Shift+M");
  }
}
