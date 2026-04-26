import {
  Tray,
  BrowserWindow,
  nativeImage,
  nativeTheme,
  Menu,
  app,
  type MenuItemConstructorOptions,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type CalendarResult, isCalendarOk } from "../shared/models.js";
import { getCalendarEventsResult as getCalendarEventsDefault } from "./calendar.js";
import { createSettingsWindow } from "./settings-window.js";
import { getSettings } from "./settings.js";
import { formatRemainingTime } from "../shared/utils/time.js";
import { buildMeetingMenuTemplate } from "./menu/meeting-menu.js";
import { getLastKnownEvents } from "./scheduler/facade.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));


let tray: Tray | null = null;
let themeListener: (() => void) | null = null;

let aboutOpen = false;
let beforeQuitRegistered = false;

function showAbout(mainWindow: BrowserWindow): void {
  if (aboutOpen) {
    // Focus the existing about window if it's still alive
    const existing = BrowserWindow.getAllWindows().find((w) => w !== mainWindow);
    if (existing) {
      existing.focus();
      return;
    }
    // Window closed without firing 'closed' — reset flag and open a new panel
    aboutOpen = false;
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

export function setupTray(mainWindow: BrowserWindow, getEvents?: () => Promise<CalendarResult>): void {
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
    if (icon1x.isEmpty() || icon2x.isEmpty()) {
      console.error('[tray] Failed to load tray icon images');
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

  // Left-click → cache-then-refresh meeting menu
  tray.on("click", async () => {
    // Show cached events immediately if available
    const cached = getLastKnownEvents();
    const cachedEvents = cached && isCalendarOk(cached) ? cached.events : null;
    if (cachedEvents) {
      const template = buildMeetingMenuTemplate(cachedEvents, getSettings().showTomorrowMeetings, {
        onAbout: () => showAbout(mainWindow),
        onOpenSettings: () => createSettingsWindow(),
      });
      if (tray) tray.popUpContextMenu(Menu.buildFromTemplate(template));
    }
    // Always trigger background refresh
    const result = await (getEvents ?? getCalendarEventsDefault)();
    if (isCalendarOk(result) && (!cachedEvents || result.events !== cachedEvents)) {
      const template = buildMeetingMenuTemplate(result.events, getSettings().showTomorrowMeetings, {
        onAbout: () => showAbout(mainWindow),
        onOpenSettings: () => createSettingsWindow(),
      });
      if (tray) tray.popUpContextMenu(Menu.buildFromTemplate(template));
    } else if (!cachedEvents && !isCalendarOk(result)) {
      // No cache and fetch failed — show error menu
      const template: MenuItemConstructorOptions[] = [
        { label: "Calendar unavailable", enabled: false },
        { type: "separator" },
        { label: "Settings...", click: () => createSettingsWindow() },
        { label: "About GogMeet", click: () => showAbout(mainWindow) },
        { label: "Quit", accelerator: "Cmd+Q", click: () => app.quit() },
      ];
      if (tray) tray.popUpContextMenu(Menu.buildFromTemplate(template));
    }
  });
}

/**
 * Destroy the tray and remove the nativeTheme listener.
 * Safe to call multiple times.
 */
export function destroyTray(): void {
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

/** Re-export for consumers that import from tray (e.g. tests) */
export { formatRemainingTime } from "../shared/utils/time.js";

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
