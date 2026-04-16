import { app, type MenuItemConstructorOptions } from "electron";
import { buildMeetUrl, openMeetingUrl } from "../utils/meet-url.js";
import { formatMeetingTime, startOfDay, startOfTomorrow } from "../../shared/utils/time.js";
import type { MeetingEvent } from "../../shared/models.js";

interface MenuCallbacks {
  onAbout: () => void;
  onOpenSettings: () => void;
}

/**
 * Build menu template with upcoming meetings grouped by day.
 * Includes all non-all-day upcoming events. Items without a meetUrl are shown disabled.
 */
export function buildMeetingMenuTemplate(
  events: MeetingEvent[],
  showTomorrowMeetings: boolean,
  callbacks: MenuCallbacks,
): MenuItemConstructorOptions[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = startOfTomorrow();
  const dayAfterStart = new Date(tomorrowStart);
  dayAfterStart.setDate(dayAfterStart.getDate() + 1);

  const upcoming = events.filter((e) => {
    if (e.isAllDay) return false;
    return new Date(e.endDate) > now;
  });

  if (upcoming.length === 0) {
    return [
      { label: "No upcoming meetings", enabled: false },
      { type: "separator" },
      { label: "Settings...", click: () => callbacks.onOpenSettings() },
      { label: "About GogMeet", click: () => callbacks.onAbout() },
      { label: "Quit", accelerator: "Cmd+Q", click: () => app.quit() },
    ];
  }

  const todayEvents = upcoming.filter((e) => {
    const d = new Date(e.startDate);
    return d >= todayStart && d < tomorrowStart;
  });
  const tomorrowEvents = upcoming.filter((e) => {
    const d = new Date(e.startDate);
    return d >= tomorrowStart && d < dayAfterStart;
  });

  const items: MenuItemConstructorOptions[] = [];

  if (todayEvents.length > 0) {
    items.push({ label: "Today", enabled: false });
    for (const event of todayEvents) {
      const hasUrl = !!event.meetUrl;
      const isInProgress = new Date(event.startDate) <= now;
      const timeLabel = isInProgress
        ? `${formatMeetingTime(event.startDate)} – In progress`
        : formatMeetingTime(event.startDate);
      items.push({
        label: `${event.title}  –  ${timeLabel}`,
        enabled: hasUrl,
        ...(hasUrl && {
          click: () => {
            const url = buildMeetUrl(event);
            if (!url) return;
            void openMeetingUrl(url);
          },
        }),
      });
    }
  }

  if (showTomorrowMeetings && tomorrowEvents.length > 0) {
    if (items.length > 0) items.push({ type: "separator" });
    items.push({ label: "Tomorrow", enabled: false });
    for (const event of tomorrowEvents) {
      const hasUrl = !!event.meetUrl;
      items.push({
        label: `${event.title}  –  ${formatMeetingTime(event.startDate)}`,
        enabled: hasUrl,
        ...(hasUrl && {
          click: () => {
            const url = buildMeetUrl(event);
            if (!url) return;
            void openMeetingUrl(url);
          },
        }),
      });
    }
  }

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
