import type { BrowserWindow } from "electron";
import {
  Tray,
  nativeImage,
  nativeTheme,
  Menu,
  app,
  type MenuItemConstructorOptions,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { MeetingEvent } from "../shared/meeting-event.js";
import { createSettingsWindow } from "./windows/settings-window.js";
import { getSettings } from "./domain/settings.js";
import { formatRemainingTime } from "../shared/utils/time.js";
import { buildMeetingMenuTemplate } from "./menu/meeting-menu.js";
import { forcePoll } from "./scheduler/facade.js";
import { mainBus } from "./events.js";
import { showAbout } from "./windows/about-window.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;
let cachedMeetings: MeetingEvent[] | null = null;
let themeListener: (() => void) | null = null;
let meetingsListener: ((events: MeetingEvent[]) => void) | null = null;

let beforeQuitRegistered = false;

function buildContextMenuTemplate(mainWindow: BrowserWindow): MenuItemConstructorOptions[] {
  const cachedEvents = cachedMeetings;
  if (cachedEvents) {
    return buildMeetingMenuTemplate(cachedEvents, getSettings().showTomorrowMeetings, {
      onAbout: () => showAbout(mainWindow),
      onOpenSettings: () => createSettingsWindow(),
    });
  }

  return [
    { label: "Loading…", enabled: false },
    { type: "separator" },
    { label: "Settings...", click: () => createSettingsWindow() },
    { label: "About GogMeet", click: () => showAbout(mainWindow) },
    { label: "Quit", accelerator: "Cmd+Q", click: () => app.quit() },
  ];
}

function refreshContextMenu(mainWindow: BrowserWindow): void {
  tray?.setContextMenu(Menu.buildFromTemplate(buildContextMenuTemplate(mainWindow)));
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
    const icon1x = nativeImage.createFromPath(path.join(assetsDir, `tray-icon-${suffix}.png`));
    const icon2x = nativeImage.createFromPath(path.join(assetsDir, `tray-icon-${suffix}@2x.png`));
    if (icon1x.isEmpty() || icon2x.isEmpty()) {
      console.error("[tray] Failed to load tray icon images");
      return nativeImage.createEmpty();
    }
    const icon = nativeImage.createEmpty();
    icon.addRepresentation({ scaleFactor: 1.0, buffer: icon1x.toPNG() });
    icon.addRepresentation({ scaleFactor: 2.0, buffer: icon2x.toPNG() });
    return icon;
  }

  tray = new Tray(buildIcon(nativeTheme.shouldUseDarkColors));
  tray.setToolTip("GogMeet");

  // Update icon whenever the system theme changes
  themeListener = (): void => {
    tray?.setImage(buildIcon(nativeTheme.shouldUseDarkColors));
  };
  nativeTheme.on("updated", themeListener);

  // Clean up the nativeTheme listener (and tray) on app quit to avoid leaks.
  if (!beforeQuitRegistered) {
    beforeQuitRegistered = true;
    app.once("before-quit", destroyTray);
  }

  // Subscribe to meeting list updates (decoupled from scheduler module)
  if (!meetingsListener) {
    meetingsListener = (events: MeetingEvent[]): void => {
      cachedMeetings = events;
      refreshContextMenu(mainWindow);
    };
    mainBus.on("meeting-list-updated", meetingsListener);
  }

  refreshContextMenu(mainWindow);

  tray.on("click", () => {
    void forcePoll();
  });
}

/**
 * Destroy the tray and remove the nativeTheme listener.
 * Safe to call multiple times.
 */
export function destroyTray(): void {
  if (meetingsListener) {
    mainBus.off("meeting-list-updated", meetingsListener);
    meetingsListener = null;
  }
  cachedMeetings = null;
  beforeQuitRegistered = false; // Allow re-registration if tray is recreated
  if (themeListener) {
    nativeTheme.removeListener("updated", themeListener);
    themeListener = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/** Max characters to show for the event title portion of the tray label */
const TRAY_TITLE_MAX_CHARS = 12;

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
    title.length > TRAY_TITLE_MAX_CHARS ? title.slice(0, TRAY_TITLE_MAX_CHARS) + "\u2026" : title;
  if (minsRemaining !== undefined && minsRemaining > 0) {
    if (inMeeting) {
      // In-meeting format: "Title 1h 23m" or "Title 45m"
      tray.setTitle(truncated + " " + formatRemainingTime(minsRemaining));
    } else {
      // Pre-meeting format: "Title in 15 mins"
      const suffix = minsRemaining === 1 ? " in 1 min" : ` in ${minsRemaining} mins`;
      tray.setTitle(truncated + suffix);
    }
  } else {
    tray.setTitle(truncated);
  }
}
