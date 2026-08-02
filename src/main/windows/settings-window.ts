import { BrowserWindow } from "electron";
import {
  SECURE_WEB_PREFERENCES,
  getPreloadPath,
  loadWindowContent,
} from "../utils/browser-window.js";
import { bindWindowsThemeBackground, platformWindowChrome } from "../utils/window-chrome.js";
import { acquireDockVisibility, releaseDockVisibility } from "./dock-visibility.js";

let settingsWindow: BrowserWindow | null = null;
/** Unbind Windows theme listener for the cached window (if any). */
let unbindSettingsTheme: (() => void) | null = null;
/** Whether this module currently holds a Dock visibility claim. */
let settingsDockHeld = false;

declare module "electron" {
  interface BrowserWindow {
    /** When true, close proceeds to destroy instead of hide-cache. */
    __forceDestroy?: boolean;
  }
}

function holdSettingsDock(): void {
  if (settingsDockHeld) return;
  settingsDockHeld = true;
  acquireDockVisibility();
}

function releaseSettingsDock(): void {
  if (!settingsDockHeld) return;
  settingsDockHeld = false;
  releaseDockVisibility();
}

function presentSettingsWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (!win.isVisible()) {
    win.show();
  }
  // Always claim Dock while this dialog is the presented surface (idempotent).
  holdSettingsDock();
  win.focus();
}

/**
 * Creates or re-presents the settings window.
 * First open builds and loads the renderer once; later opens re-show the
 * cached window (DOM + JS state preserved) for instant presentation.
 * The renderer soft-refreshes prefs/calendar on visibility change.
 */
export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    presentSettingsWindow(settingsWindow);
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

  unbindSettingsTheme?.();
  unbindSettingsTheme = bindWindowsThemeBackground(win, "settings");

  loadWindowContent(win, "settings");

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    presentSettingsWindow(win);
  });

  // Hide-cache: keep webContents + renderer state; real destroy only on quit/tests.
  // destroy() does not emit "close" — __forceDestroy is for close()-based teardown.
  win.on("close", (event) => {
    if (win.__forceDestroy) return;
    event.preventDefault();
    if (!win.isDestroyed()) {
      win.hide();
    }
    releaseSettingsDock();
  });

  win.on("closed", () => {
    unbindSettingsTheme?.();
    unbindSettingsTheme = null;
    releaseSettingsDock();
    if (settingsWindow === win) {
      settingsWindow = null;
    }
  });

  settingsWindow = win;
  return win;
}

/** Live settings BrowserWindow if cached and not destroyed (for push fan-out). */
export function getSettingsWindow(): BrowserWindow | null {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    return settingsWindow;
  }
  return null;
}

/**
 * Force-destroy the cached settings window (shutdown / tests).
 * Uses destroy() which skips the cancelable "close" event; still sets
 * __forceDestroy for consistency with close()-based teardown paths.
 */
export function destroySettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.__forceDestroy = true;
    settingsWindow.destroy();
  }
  settingsWindow = null;
  unbindSettingsTheme?.();
  unbindSettingsTheme = null;
  releaseSettingsDock();
}
