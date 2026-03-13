import {
  Tray,
  BrowserWindow,
  nativeImage,
  nativeTheme,
  Menu,
  app,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getCalendarEventsResult } from "./calendar.js";
import { buildMeetUrl } from "./utils/meet-url.js";
import { createSettingsWindow } from "./settings-window.js";
import type { MeetingEvent } from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Format ISO date string to locale time like "10:00 AM" */
function formatMeetingTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

let tray: Tray | null = null;

let aboutOpen = false;

function showAbout(mainWindow: BrowserWindow): void {
  if (aboutOpen) {
    // Focus the existing about window
    const existing = BrowserWindow.getAllWindows().find(
      (w) => w !== mainWindow,
    );
    existing?.focus();
    return;
  }
  aboutOpen = true;
  app.showAboutPanel();
  setImmediate(() => {
    const aboutWindow = BrowserWindow.getAllWindows().find(
      (w) => w !== mainWindow,
    );
    if (aboutWindow) {
      aboutWindow.setAlwaysOnTop(true, "floating");
      aboutWindow.once("closed", () => {
        aboutOpen = false;
      });
    } else {
      aboutOpen = false;
    }
  });
}

export function setupTray(mainWindow: BrowserWindow): void {
  // In dev:      __dirname = lib/main/   → ../../src/assets
  // In packaged: __dirname = app.asar/lib/main/ → ../../src/assets (inside asar)
  //
  // IMPORTANT: use nativeImage.createFromPath() — it understands asar virtual paths.
  // fs.readFileSync() does NOT resolve asar paths in the main process and will throw,
  // which silently prevents the tray from ever being created.
  const assetsDir = path.join(__dirname, "..", "..", "src", "assets");

  function buildIcon(isDark: boolean): Electron.NativeImage {
    const suffix = isDark ? "dark" : "light";
    const icon1x = nativeImage.createFromPath(
      path.join(assetsDir, `tray-icon-${suffix}.png`),
    );
    const icon2x = nativeImage.createFromPath(
      path.join(assetsDir, `tray-icon-${suffix}@2x.png`),
    );
    const icon = nativeImage.createEmpty();
    icon.addRepresentation({ scaleFactor: 1.0, buffer: icon1x.toPNG() });
    icon.addRepresentation({ scaleFactor: 2.0, buffer: icon2x.toPNG() });
    return icon;
  }

  tray = new Tray(buildIcon(nativeTheme.shouldUseDarkColors));
  tray.setToolTip("GogMeet");

  // Update icon whenever the system theme changes
  const onThemeUpdated = (): void => {
    tray?.setImage(buildIcon(nativeTheme.shouldUseDarkColors));
  };
  nativeTheme.on("updated", onThemeUpdated);

  // Listener is cleaned up on process exit (app.before-quit destroys the tray).

  /**
   * Build menu template with upcoming meetings grouped by day.
   * Only includes events with a meetUrl (Google Meet links).
   */
  function buildMeetingMenuTemplate(
    events: MeetingEvent[],
  ): MenuItemConstructorOptions[] {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const dayAfterStart = new Date(tomorrowStart);
    dayAfterStart.setDate(dayAfterStart.getDate() + 1);

    const upcoming = events.filter((e) => {
      if (e.isAllDay) return false;
      if (!e.meetUrl) return false;
      return new Date(e.startDate) > now;
    });

    if (upcoming.length === 0) {
      return [
        { label: "No upcoming meetings", enabled: false },
        { type: "separator" },
        { label: "Settings...", click: () => createSettingsWindow() },
        { label: "About", click: () => showAbout(mainWindow) },
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
        items.push({
          label: `${event.title}  –  ${formatMeetingTime(event.startDate)}`,
          click: () => {
            const url = buildMeetUrl(event);
            if (!url) return;
            void shell.openExternal(url).catch((err) => {
              console.error("[tray] Failed to open meeting URL:", err);
            });
          },
        });
      }
    }

    if (tomorrowEvents.length > 0) {
      if (items.length > 0) items.push({ type: "separator" });
      items.push({ label: "Tomorrow", enabled: false });
      for (const event of tomorrowEvents) {
        items.push({
          label: `${event.title}  –  ${formatMeetingTime(event.startDate)}`,
          click: () => {
            const url = buildMeetUrl(event);
            if (!url) return;
            void shell.openExternal(url).catch((err) => {
              console.error("[tray] Failed to open meeting URL:", err);
            });
          },
        });
      }
    }

    items.push({ type: "separator" });
    items.push({ label: "Settings...", click: () => createSettingsWindow() });
    items.push({ label: "About", click: () => showAbout(mainWindow) });
    items.push({
      label: "Quit",
      accelerator: "Cmd+Q",
      click: () => app.quit(),
    });

    return items;
  }

  // Left-click → dynamic meeting menu
  tray.on("click", async () => {
    const result = await getCalendarEventsResult();
    let template: MenuItemConstructorOptions[];
    if ("error" in result) {
      template = [
        { label: "Calendar unavailable", enabled: false },
        { type: "separator" },
        { label: "Settings...", click: () => createSettingsWindow() },
        { label: "About", click: () => showAbout(mainWindow) },
        { label: "Quit", accelerator: "Cmd+Q", click: () => app.quit() },
      ];
    } else {
      template = buildMeetingMenuTemplate(result.events);
    }
    tray!.popUpContextMenu(Menu.buildFromTemplate(template));
  });
}

/** Max characters to show for the event title portion of the tray label */
const TRAY_TITLE_MAX_CHARS = 12;

/** Format minutes remaining as "Xh Ym" or "Xm" for in-meeting display */
export function formatRemainingTime(totalMins: number): string {
  if (totalMins <= 0) return "0m";
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

/**
 * Update the tray status bar title next to the icon.
 * Pass null or empty string to clear.
 * Pass minsRemaining to append " in X mins" / " in 1 min" countdown suffix.
 * Pass inMeeting=true to use "Xh Ym" format instead of "in X mins".
 */
export function updateTrayTitle(
  title: string | null,
  minsRemaining?: number,
  inMeeting?: boolean, // when true, use "Xh Ym" format instead of "in X mins"
): void {
  if (!tray) return;
  if (!title) {
    tray.setTitle("");
    return;
  }
  const truncated =
    title.length > TRAY_TITLE_MAX_CHARS
      ? title.slice(0, TRAY_TITLE_MAX_CHARS) + "\u2026"
      : title;
  if (minsRemaining !== undefined && minsRemaining > 0) {
    if (inMeeting) {
      // In-meeting format: "Title 1h 23m" or "Title 45m"
      tray.setTitle(truncated + " " + formatRemainingTime(minsRemaining));
    } else {
      // Pre-meeting format: "Title in 15 mins"
      const suffix =
        minsRemaining === 1 ? " in 1 min" : ` in ${minsRemaining} mins`;
      tray.setTitle(truncated + suffix);
    }
  } else {
    tray.setTitle(truncated);
  }
}
