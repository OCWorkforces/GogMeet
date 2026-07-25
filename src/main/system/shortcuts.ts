import { globalShortcut, Notification } from "electron";
import { getCalendarEventsResult } from "../domain/calendar.js";
import { isCalendarOk } from "../../shared/calendar-result.js";
import type { MeetingEvent } from "../../shared/meeting-event.js";
import { getLastKnownEvents } from "../scheduler/facade.js";
import { joinMeetingById } from "../utils/join-meeting.js";
import log from "electron-log";

let registered = false;

/**
 * Prefer the joinable in-progress meeting; otherwise the next future meeting with a URL.
 * Pure selection helper for the global hotkey.
 */
export function pickJoinTarget(events: readonly MeetingEvent[], nowMs: number): MeetingEvent | null {
  const withUrl = events.filter((e) => !e.isAllDay && !!e.meetUrl);
  const inProgress = withUrl
    .filter((e) => {
      const start = new Date(e.startDate).getTime();
      const end = new Date(e.endDate).getTime();
      return start <= nowMs && nowMs < end;
    })
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  if (inProgress[0]) return inProgress[0];

  const upcoming = withUrl
    .filter((e) => new Date(e.startDate).getTime() > nowMs)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return upcoming[0] ?? null;
}

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
