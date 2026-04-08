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

import { getCalendarEventsResult } from "./calendar.js";
import { createSettingsWindow } from "./settings-window.js";
import { getSettings } from "./settings.js";
import { formatRemainingTime } from "../shared/utils/time.js";
import { buildMeetingMenuTemplate } from "./menu/meeting-menu.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));


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

  // Left-click → dynamic meeting menu
  tray.on("click", async () => {
    const result = await getCalendarEventsResult();
    let template: MenuItemConstructorOptions[];
    if ("error" in result) {
      template = [
        { label: "Calendar unavailable", enabled: false },
        { type: "separator" },
        { label: "Settings...", click: () => createSettingsWindow() },
        { label: "About GogMeet", click: () => showAbout(mainWindow) },
        { label: "Quit", accelerator: "Cmd+Q", click: () => app.quit() },
      ];
    } else {
      template = buildMeetingMenuTemplate(result.events, getSettings().showTomorrowMeetings, {
        onAbout: () => showAbout(mainWindow),
      });
    }
    tray!.popUpContextMenu(Menu.buildFromTemplate(template));
  });
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
