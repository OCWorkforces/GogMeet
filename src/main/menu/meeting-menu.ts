import { app, clipboard, type MenuItemConstructorOptions } from "electron";
import { formatMeetingTime, startOfDay, startOfTomorrow } from "../../shared/utils/time.js";
import type { MeetingEvent } from "../../shared/meeting-event.js";
import { pickJoinTarget } from "../../shared/utils/pick-join-target.js";
import type { CalendarStatus } from "../domain/calendar-status.js";
import { forcePoll } from "../scheduler/facade.js";
import { joinMeetingById } from "../utils/join-meeting.js";
import { buildMeetUrl } from "../utils/meet-url.js";
import { openSystemSettings } from "../utils/system-settings.js";

interface MenuCallbacks {
  onAbout: () => void;
  onOpenSettings: () => void;
}

function statusRows(status: CalendarStatus): MenuItemConstructorOptions[] {
  if (status.kind !== "err") return [];
  if (status.code === "permission-denied") {
    return [
      {
        label: "Calendar access denied",
        enabled: false,
      },
      {
        label: "Open Calendar Privacy Settings…",
        click: () => {
          void openSystemSettings("calendars");
        },
      },
      { type: "separator" },
    ];
  }
  if (status.code === "no-calendars") {
    return [{ label: "No calendars available", enabled: false }, { type: "separator" }];
  }
  return [
    {
      label: status.error.length > 48 ? `${status.error.slice(0, 45)}…` : status.error,
      enabled: false,
    },
    { type: "separator" },
  ];
}

function meetingItem(event: MeetingEvent, now: Date): MenuItemConstructorOptions {
  const hasUrl = !!event.meetUrl;
  const isInProgress = new Date(event.startDate) <= now;
  const timeLabel = isInProgress
    ? `${formatMeetingTime(event.startDate)} – In progress`
    : formatMeetingTime(event.startDate);

  if (!hasUrl) {
    return {
      label: `${event.title}  –  ${timeLabel}`,
      enabled: false,
    };
  }

  return {
    label: `${event.title}  –  ${timeLabel}`,
    submenu: [
      {
        label: "Join",
        click: () => {
          void joinMeetingById(event.id);
        },
      },
      {
        label: "Copy Link",
        click: () => {
          const url = buildMeetUrl(event);
          if (url) clipboard.writeText(url);
        },
      },
    ],
  };
}

/**
 * Build menu template with upcoming meetings grouped by day.
 * Includes all non-all-day upcoming events. Items without a meetUrl are shown disabled.
 */
export function buildMeetingMenuTemplate(
  events: MeetingEvent[],
  showTomorrowMeetings: boolean,
  callbacks: MenuCallbacks,
  status: CalendarStatus = { kind: "unknown" },
): MenuItemConstructorOptions[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = startOfTomorrow();
  const dayAfterStart = new Date(tomorrowStart);
  dayAfterStart.setDate(dayAfterStart.getDate() + 1);

  const items: MenuItemConstructorOptions[] = [...statusRows(status)];

  const upcoming = events.filter((e) => {
    if (e.isAllDay) return false;
    return new Date(e.endDate) > now;
  });

  if (upcoming.length === 0 && status.kind !== "err") {
    items.push({ label: "No upcoming meetings", enabled: false });
  } else if (upcoming.length > 0) {
    const todayEvents = upcoming.filter((e) => {
      const d = new Date(e.startDate);
      return d >= todayStart && d < tomorrowStart;
    });
    const tomorrowEvents = upcoming.filter((e) => {
      const d = new Date(e.startDate);
      return d >= tomorrowStart && d < dayAfterStart;
    });

    if (todayEvents.length > 0) {
      items.push({ label: "Today", enabled: false });
      for (const event of todayEvents) {
        items.push(meetingItem(event, now));
      }
    }

    if (showTomorrowMeetings && tomorrowEvents.length > 0) {
      if (todayEvents.length > 0) items.push({ type: "separator" });
      items.push({ label: "Tomorrow", enabled: false });
      for (const event of tomorrowEvents) {
        items.push(meetingItem(event, now));
      }
    }
  }

  items.push({ type: "separator" });

  const next = pickJoinTarget(events, now.getTime());
  items.push({
    label: "Join Next Meeting",
    enabled: next !== null,
    click: () => {
      if (!next) return;
      void joinMeetingById(next.id);
    },
  });
  items.push({
    label: "Refresh",
    click: () => {
      void forcePoll();
    },
  });
  items.push({ type: "separator" });
  items.push({ label: "Settings...", click: () => callbacks.onOpenSettings() });
  items.push({ label: "About GogMeet", click: () => callbacks.onAbout() });
  items.push({
    label: "Quit",
    accelerator: "Cmd+Q",
    click: () => app.quit(),
  });

  return items;
}
