import { app, BrowserWindow } from "electron";
import {
  SECURE_WEB_PREFERENCES,
  getPreloadPath,
  loadWindowContent,
} from "../utils/browser-window.js";
import { bindWindowsThemeBackground, platformWindowChrome } from "../utils/window-chrome.js";

let settingsWindow: BrowserWindow | null = null;

/**
 * Creates or focuses the settings window.
 * Singleton pattern - only one settings window at a time.
 * Shows in Dock when open, closes normally (not hide-on-close).
 */
export function createSettingsWindow(): BrowserWindow {
  // Return existing window if already open and focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  const chrome = platformWindowChrome("settings");
  const win = new BrowserWindow({
    width: 520,
    // Grouped lists + timing fields (alert lead, quiet hours, late join)
    height: 760,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    ...chrome,
    webPreferences: {
      preload: getPreloadPath(),
      ...SECURE_WEB_PREFERENCES,
    },
  });

  const unbindTheme = bindWindowsThemeBackground(win, "settings");

  loadWindowContent(win, "settings");

  // Show window when ready
  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.show();
    // Show in Dock when settings window is open
    app.dock?.show();
  });

  // Clean up reference on close
  win.on("closed", () => {
    unbindTheme();
    settingsWindow = null;
    // Hide from Dock when settings window closes (tray-only app)
    app.dock?.hide();
  });

  settingsWindow = win;
  return win;
}
