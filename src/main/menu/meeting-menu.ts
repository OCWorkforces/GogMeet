import { app, clipboard, type MenuItemConstructorOptions } from "electron";
import { formatMeetingTime, startOfDay, startOfTomorrow } from "../../domain/services/time.js";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import type { CalendarUiState } from "../../domain/entities/calendar-ui-state.js";
import { pickJoinTarget } from "../../domain/services/pick-join-target.js";
import type { EventId } from "../../domain/entities/brand.js";
import type { CalendarStatus } from "../facades/calendar-status.js";
import { buildMeetUrl } from "../../domain/services/build-meet-url.js";
import { openSystemSettings } from "../utils/system-settings.js";
import { isDarwin } from "../platform/os.js";

export interface MenuCallbacks {
  onAbout: () => void;
  onOpenSettings: () => void;
  onConnectGoogle?: () => void;
  onDisconnectGoogle?: () => void;
  onRetryPoll?: () => void;
  /** Join a meeting by id (typically graph.join.byId). */
  onJoinMeeting: (id: EventId) => void;
  /** Force calendar poll (typically graph.scheduler.forcePoll). */
  onForcePoll: () => void;
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

function meetingItem(
  event: MeetingEvent,
  now: Date,
  callbacks: MenuCallbacks,
): MenuItemConstructorOptions {
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
          callbacks.onJoinMeeting(event.id);
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

function meetingDayRows(
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
      items.push(meetingItem(event, now, callbacks));
    }
  }

  if (showTomorrowMeetings && tomorrowEvents.length > 0) {
    if (items.length > 0) items.push({ type: "separator" });
    items.push({ label: "Tomorrow", enabled: false });
    for (const event of tomorrowEvents) {
      items.push(meetingItem(event, now, callbacks));
    }
  }

  return items;
}

function footerItems(
  events: MeetingEvent[],
  callbacks: MenuCallbacks,
): MenuItemConstructorOptions[] {
  const now = new Date();
  const next = pickJoinTarget(events, now.getTime());
  return [
    { type: "separator" },
    {
      label: "Join Next Meeting",
      enabled: next !== null,
      click: () => {
        if (!next) return;
        callbacks.onJoinMeeting(next.id);
      },
    },
    {
      label: "Refresh",
      click: () => {
        callbacks.onForcePoll();
      },
    },
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

/**
 * Build menu template with upcoming meetings grouped by day.
 * Includes all non-all-day upcoming events. Items without a meetUrl are shown disabled.
 * Join/Copy Link submenus and Join Next / Refresh actions are always present.
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
        items.push(meetingItem(event, now, callbacks));
      }
    }

    if (showTomorrowMeetings && tomorrowEvents.length > 0) {
      if (todayEvents.length > 0) items.push({ type: "separator" });
      items.push({ label: "Tomorrow", enabled: false });
      for (const event of tomorrowEvents) {
        items.push(meetingItem(event, now, callbacks));
      }
    }
  }

  items.push(...footerItems(events, callbacks));
  return items;
}

/**
 * Build tray menu from calendar UI state (Windows connect CTA + errors + meetings).
 * On Darwin with granted/ready/empty, behaves like the classic meeting menu with join actions.
 */
export function buildCalendarTrayMenuTemplate(
  ui: CalendarUiState,
  showTomorrowMeetings: boolean,
  callbacks: MenuCallbacks,
  status: CalendarStatus = { kind: "unknown" },
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  const events = ui.events ?? [];

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
      return [...items, ...footerItems(events, callbacks)];
    } else if (ui.accountEmail) {
      items.push({ label: `Connected as ${ui.accountEmail}`, enabled: false });
    }
  } else {
    items.push(...statusRows(status));
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
    return [...items, ...footerItems(events, callbacks)];
  }

  if (ui.events !== null) {
    const dayRows = meetingDayRows(ui.events, showTomorrowMeetings, callbacks);
    // Avoid double "No upcoming meetings" when empty and status already empty-ish
    items.push(...dayRows);
    if (ui.phase === "limited") {
      items.push({
        label: (ui.lastError ?? "Some calendars could not be refreshed").slice(0, 80),
        enabled: false,
      });
    }
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

  return [...items, ...footerItems(events, callbacks)];
}
