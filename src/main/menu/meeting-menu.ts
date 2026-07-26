import { app, type MenuItemConstructorOptions } from "electron";
import { buildMeetUrl, openMeetingUrl } from "../utils/meet-url.js";
import { formatMeetingTime, startOfDay, startOfTomorrow } from "../../shared/utils/time.js";
import type { MeetingEvent } from "../../shared/meeting-event.js";
import type { CalendarUiState } from "../../shared/calendar-ui-state.js";
import { isDarwin } from "../platform/os.js";

export interface MenuCallbacks {
  onAbout: () => void;
  onOpenSettings: () => void;
  onConnectGoogle?: () => void;
  onDisconnectGoogle?: () => void;
  onRetryPoll?: () => void;
}

function footerItems(callbacks: MenuCallbacks): MenuItemConstructorOptions[] {
  return [
    { type: "separator" },
    { label: "Settings...", click: () => callbacks.onOpenSettings() },
    { label: "About GogMeet", click: () => callbacks.onAbout() },
    {
      label: "Quit",
      accelerator: "CommandOrControl+Q",
      click: () => app.quit(),
    },
  ];
}

function meetingRows(
  events: MeetingEvent[],
  showTomorrowMeetings: boolean,
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
    return [{ label: "No upcoming meetings", enabled: false }];
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

  return items;
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
  return [...meetingRows(events, showTomorrowMeetings), ...footerItems(callbacks)];
}

/**
 * Build tray menu from calendar UI state (Windows connect CTA + errors + meetings).
 * On Darwin with granted/ready/empty, behaves like the classic meeting menu.
 */
export function buildCalendarTrayMenuTemplate(
  ui: CalendarUiState,
  showTomorrowMeetings: boolean,
  callbacks: MenuCallbacks,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];

  // Windows / Google connect surface
  if (!isDarwin()) {
    if (ui.phase === "connecting") {
      items.push({ label: "Connecting to Google…", enabled: false });
    } else if (ui.permission !== "granted") {
      items.push({ label: "No calendar connected", enabled: false });
      if (callbacks.onConnectGoogle) {
        const label =
          ui.permission === "denied" ? "Reconnect Google Calendar…" : "Connect Google Calendar…";
        items.push({
          label,
          enabled: ui.oauthConfigured,
          click: () => callbacks.onConnectGoogle?.(),
        });
      }
      if (!ui.oauthConfigured) {
        items.push({
          label: "Set GOOGLE_OAUTH_CLIENT_ID to enable",
          enabled: false,
        });
      }
      items.push({
        label: "Outlook support coming in a later version",
        enabled: false,
      });
      if (ui.lastError) {
        items.push({ label: ui.lastError.slice(0, 80), enabled: false });
      }
      return [...items, ...footerItems(callbacks)];
    } else if (ui.accountEmail) {
      items.push({ label: `Connected as ${ui.accountEmail}`, enabled: false });
    }
  }

  if (ui.phase === "error" && (!ui.events || ui.events.length === 0)) {
    items.push({
      label: ui.lastError ? ui.lastError.slice(0, 80) : "Calendar error",
      enabled: false,
    });
    if (callbacks.onRetryPoll) {
      items.push({ label: "Retry", click: () => callbacks.onRetryPoll?.() });
    }
    if (!isDarwin() && callbacks.onConnectGoogle) {
      items.push({
        label: "Reconnect Google Calendar…",
        click: () => callbacks.onConnectGoogle?.(),
      });
    }
    return [...items, ...footerItems(callbacks)];
  }

  if (ui.events !== null) {
    items.push(...meetingRows(ui.events, showTomorrowMeetings));
    if (ui.offline) {
      items.push({ label: "Offline — showing last synced meetings", enabled: false });
    }
  } else if (ui.phase === "empty" || ui.permission === "granted") {
    items.push({ label: "No upcoming meetings", enabled: false });
  } else {
    items.push({ label: "Loading…", enabled: false });
  }

  if (!isDarwin() && ui.permission === "granted" && callbacks.onDisconnectGoogle) {
    items.push({ type: "separator" });
    items.push({
      label: "Disconnect Google Calendar",
      click: () => callbacks.onDisconnectGoogle?.(),
    });
  }

  return [...items, ...footerItems(callbacks)];
}
