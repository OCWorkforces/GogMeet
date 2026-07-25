import { globalShortcut, Notification } from "electron";
import { getCalendarEventsResult } from "../domain/calendar.js";
import { isCalendarOk } from "../../shared/calendar-result.js";
import { pickJoinTarget } from "../../shared/utils/pick-join-target.js";
import { getLastKnownEvents } from "../scheduler/facade.js";
import { joinMeetingById } from "../utils/join-meeting.js";
import log from "electron-log";

export { pickJoinTarget } from "../../shared/utils/pick-join-target.js";

let registered = false;

function notifyUser(title: string, body: string): void {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
      return;
    }
  } catch {
    // fall through to log
  }
  log.info(`[shortcuts] ${title}: ${body}`);
}

export function registerShortcuts(): void {
  if (registered) return;

  const ret = globalShortcut.register("CmdOrCtrl+Shift+M", async () => {
    log.info("[shortcuts] Cmd+Shift+M pressed — joining next meeting");
    try {
      const result = getLastKnownEvents() ?? (await getCalendarEventsResult());
      if (!isCalendarOk(result)) {
        log.warn("[shortcuts] No calendar access");
        notifyUser("GogMeet", "Calendar access is required to join a meeting.");
        return;
      }
      const target = pickJoinTarget(result.events, Date.now());
      if (!target) {
        log.info("[shortcuts] No joinable meetings");
        notifyUser("GogMeet", "No upcoming meetings with a join link.");
        return;
      }

      const joined = await joinMeetingById(target.id);
      if (!joined.ok) {
        log.warn("[shortcuts] Join failed:", joined.error);
        notifyUser("GogMeet", joined.error);
      }
    } catch (e) {
      log.error("[shortcuts] Failed to join meeting:", e);
    }
  });

  if (ret) {
    registered = true;
    log.info("[shortcuts] Registered Cmd+Shift+M");
  } else {
    log.warn("[shortcuts] Failed to register Cmd+Shift+M");
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll();
  registered = false;
}
