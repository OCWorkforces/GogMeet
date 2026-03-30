import { app, BrowserWindow } from "electron";
import {
  SECURE_WEB_PREFERENCES,
  getPreloadPath,
  loadWindowContent,
} from "./utils/browser-window.js";

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

  const win = new BrowserWindow({
    width: 520,
    height: 480,
    minWidth: 520,
    minHeight: 480,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: "hiddenInset",
    vibrancy: "under-window",
    visualEffectState: "active",
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      ...SECURE_WEB_PREFERENCES,
    },
  });

  loadWindowContent(win, "settings");

  // Show window when ready
  win.once("ready-to-show", () => {
    win.show();
    // Show in Dock when settings window is open
    app.dock?.show();
  });

  // Clean up reference on close
  win.on("closed", () => {
    settingsWindow = null;
    // Hide from Dock when settings window closes (tray-only app)
    app.dock?.hide();
  });

  settingsWindow = win;
  return win;
}
