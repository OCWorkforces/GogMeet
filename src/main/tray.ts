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

import type { MeetingEvent } from "../shared/models.js";
import { createSettingsWindow } from "./settings-window.js";
import { getSettings } from "./settings.js";
import { formatRemainingTime } from "../shared/utils/time.js";
import { buildMeetingMenuTemplate } from "./menu/meeting-menu.js";
import { forcePoll } from "./scheduler/facade.js";
import { mainBus } from "./events.js";
import { getPackageInfo } from "./utils/packageInfo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;
let cachedMeetings: MeetingEvent[] | null = null;
let themeListener: (() => void) | null = null;
let meetingsListener: ((events: MeetingEvent[]) => void) | null = null;

let beforeQuitRegistered = false;

/** Reference to the singleton About BrowserWindow (null when not open). */
let aboutWindow: BrowserWindow | null = null;

function showAbout(_mainWindow: BrowserWindow): void {
  // Reuse existing about window if still alive
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  const packageJson = getPackageInfo();
  const version = app.getVersion();
  const appName = app.getName();

  const html = `\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>About ${appName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
    background: #1d1d1f;
    color: #f5f5f7;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    -webkit-app-region: drag;
    user-select: none;
    -webkit-user-select: none;
  }
  .app-icon {
    width: 80px;
    height: 80px;
    margin-bottom: 20px;
    border-radius: 18px;
    background: linear-gradient(135deg, #4285f4, #34a853, #fbbc04, #ea4335);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    color: white;
    font-weight: 700;
  }
  h1 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .version {
    font-size: 13px;
    color: #98989d;
    margin-bottom: 18px;
  }
  .copyright {
    font-size: 12px;
    color: #98989d;
    text-align: center;
    line-height: 1.5;
    margin-bottom: 24px;
  }
  button {
    font-family: inherit;
    font-size: 13px;
    padding: 6px 24px;
    border-radius: 6px;
    border: 1px solid #48484a;
    background: #2c2c2e;
    color: #f5f5f7;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  button:hover {
    background: #3a3a3c;
  }
  button:active {
    background: #48484a;
  }
</style>
</head>
<body>
  <div class="app-icon">G</div>
  <h1>${appName}</h1>
  <div class="version">Version ${version}</div>
  <div class="copyright">${packageJson.author ? `Developed by ${packageJson.author}` : ""}</div>
  <button onclick="window.close()">Close</button>
</body>
</html>`;

  const win = new BrowserWindow({
    width: 300,
    height: 340,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    titleBarStyle: "hiddenInset",
    vibrancy: "under-window",
    visualEffectState: "active",
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.show();
  });

  win.on("closed", () => {
    if (aboutWindow === win) {
      aboutWindow = null;
    }
  });

  aboutWindow = win;
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
    };
    mainBus.on("meeting-list-updated", meetingsListener);
  }

  // Left-click → show cached events immediately, then force-poll in background
  tray.on("click", () => {
    // Show cached events immediately if available
    const cachedEvents = cachedMeetings;
    if (cachedEvents) {
      const template = buildMeetingMenuTemplate(cachedEvents, getSettings().showTomorrowMeetings, {
        onAbout: () => showAbout(mainWindow),
        onOpenSettings: () => createSettingsWindow(),
      });
      if (tray) tray.popUpContextMenu(Menu.buildFromTemplate(template));
    } else {
      // No cache — show minimal placeholder menu while polling
      const template: MenuItemConstructorOptions[] = [
        { label: "Loading…", enabled: false },
        { type: "separator" },
        { label: "Settings...", click: () => createSettingsWindow() },
        { label: "About GogMeet", click: () => showAbout(mainWindow) },
        { label: "Quit", accelerator: "Cmd+Q", click: () => app.quit() },
      ];
      if (tray) tray.popUpContextMenu(Menu.buildFromTemplate(template));
    }
    // Fire force-poll in background — CALENDAR_EVENTS_UPDATED push will refresh the open popover
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
