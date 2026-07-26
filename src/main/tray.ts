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
import type { CalendarUiState } from "../shared/calendar-ui-state.js";
import { createSettingsWindow } from "./windows/settings-window.js";
import { getSettings } from "./domain/settings.js";
import { formatRemainingTime } from "../shared/utils/time.js";
import { buildCalendarTrayMenuTemplate } from "./menu/meeting-menu.js";
import { forcePoll } from "./scheduler/facade.js";
import { mainBus } from "./events.js";
import { showAbout } from "./windows/about-window.js";
import { isDarwin } from "./platform/os.js";
import {
  disconnectCalendar,
  getCalendarUiState,
  requestCalendarPermission,
} from "./domain/calendar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;
let cachedMeetings: MeetingEvent[] | null = null;
let cachedUi: CalendarUiState | null = null;
let themeListener: (() => void) | null = null;
let meetingsListener: ((events: MeetingEvent[]) => void) | null = null;
let statusListener: ((status: CalendarUiState) => void) | null = null;
/** Last tooltip text applied (Windows) — skip redundant setToolTip to reduce flicker. */
let lastToolTip: string | null = null;
/** Built menu held for Windows popUpContextMenu on left-click. */
let lastContextMenu: Electron.Menu | null = null;

let beforeQuitRegistered = false;

/** Max characters for the event title portion of the macOS status-item title */
const TRAY_TITLE_MAX_CHARS = 12;

/** Windows notification-area tooltip practical limit (characters). */
export const TRAY_TOOLTIP_MAX_CHARS = 63;

const DEFAULT_TRAY_TOOLTIP = "GogMeet";
const OFFLINE_TRAY_TOOLTIP = "GogMeet — Offline";

function assetsDir(): string {
  // In dev:      __dirname = lib/main/   → ../../src/assets
  // In packaged: __dirname = app.asar/lib/main/ → ../../src/assets (inside asar)
  return path.join(__dirname, "..", "..", "src", "assets");
}

function menuCallbacks(mainWindow: BrowserWindow) {
  return {
    onAbout: () => showAbout(mainWindow),
    onOpenSettings: () => createSettingsWindow(),
    onConnectGoogle: () => {
      void requestCalendarPermission().then((status) => {
        if (status === "granted") {
          void forcePoll();
        }
      });
    },
    onDisconnectGoogle: () => {
      void disconnectCalendar().then(() => {
        cachedMeetings = null;
        refreshContextMenu(mainWindow);
      });
    },
    onRetryPoll: () => {
      void forcePoll();
    },
  };
}

function buildContextMenuTemplate(mainWindow: BrowserWindow): MenuItemConstructorOptions[] {
  const ui = cachedUi ?? getCalendarUiState();
  const events = cachedMeetings ?? ui.events ?? [];

  const snapshot: CalendarUiState = {
    ...ui,
    events: cachedMeetings ?? ui.events,
  };

  if (cachedMeetings && snapshot.permission === "not-determined" && isDarwin()) {
    return buildCalendarTrayMenuTemplate(
      {
        ...snapshot,
        permission: "granted",
        phase: cachedMeetings.length === 0 ? "empty" : "ready",
        events: cachedMeetings,
      },
      getSettings().showTomorrowMeetings,
      menuCallbacks(mainWindow),
    );
  }

  if (!cachedMeetings && !cachedUi) {
    return [
      { label: "Loading…", enabled: false },
      { type: "separator" },
      { label: "Settings...", click: () => createSettingsWindow() },
      { label: "About GogMeet", click: () => showAbout(mainWindow) },
      { label: "Quit", accelerator: "CommandOrControl+Q", click: () => app.quit() },
    ];
  }

  return buildCalendarTrayMenuTemplate(
    snapshot.events ? snapshot : { ...snapshot, events },
    getSettings().showTomorrowMeetings,
    menuCallbacks(mainWindow),
  );
}

function refreshContextMenu(mainWindow: BrowserWindow): void {
  const template = buildContextMenuTemplate(mainWindow);
  const menu = Menu.buildFromTemplate(template);
  lastContextMenu = menu;
  // Install so right-click / status-item activation works before first click (macOS + Windows).
  tray?.setContextMenu(menu);
}

/**
 * macOS menu-bar icon: 18pt + 36pt (@2x) dark/light PNGs.
 */
function buildDarwinIcon(isDark: boolean): Electron.NativeImage {
  const dir = assetsDir();
  const suffix = isDark ? "dark" : "light";
  const icon1x = nativeImage.createFromPath(path.join(dir, `tray-icon-${suffix}.png`));
  const icon2x = nativeImage.createFromPath(path.join(dir, `tray-icon-${suffix}@2x.png`));
  if (icon1x.isEmpty() || icon2x.isEmpty()) {
    console.error("[tray] Failed to load macOS tray icon images");
    return nativeImage.createEmpty();
  }
  const icon = nativeImage.createEmpty();
  icon.addRepresentation({ scaleFactor: 1.0, buffer: icon1x.toPNG() });
  icon.addRepresentation({ scaleFactor: 2.0, buffer: icon2x.toPNG() });
  return icon;
}

/**
 * Windows notification-area icon: dedicated 16×16 and 32×32 PNGs (no templates).
 * Falls back to resizing macOS assets if win assets are missing.
 */
function buildWindowsIcon(isDark: boolean): Electron.NativeImage {
  const dir = assetsDir();
  const suffix = isDark ? "dark" : "light";
  const icon16 = nativeImage.createFromPath(path.join(dir, `tray-icon-win-${suffix}-16.png`));
  const icon32 = nativeImage.createFromPath(path.join(dir, `tray-icon-win-${suffix}-32.png`));

  if (!icon16.isEmpty() && !icon32.isEmpty()) {
    const icon = nativeImage.createEmpty();
    icon.addRepresentation({ scaleFactor: 1.0, buffer: icon16.toPNG() });
    icon.addRepresentation({ scaleFactor: 2.0, buffer: icon32.toPNG() });
    return icon;
  }

  // Fallback: resize existing macOS tray assets
  const fallback = nativeImage.createFromPath(path.join(dir, `tray-icon-${suffix}@2x.png`));
  if (fallback.isEmpty()) {
    console.error("[tray] Failed to load Windows tray icon images");
    return nativeImage.createEmpty();
  }
  return fallback.resize({ width: 16, height: 16 });
}

function buildIcon(isDark: boolean): Electron.NativeImage {
  return isDarwin() ? buildDarwinIcon(isDark) : buildWindowsIcon(isDark);
}

function applyToolTip(text: string): void {
  if (!tray) return;
  if (lastToolTip === text) return;
  lastToolTip = text;
  tray.setToolTip(text);
}

/**
 * Build the countdown label shared by macOS title and Windows tooltip.
 * Exported for unit tests.
 */
export function formatTrayCountdownLabel(
  title: string,
  minsRemaining?: number,
  inMeeting?: boolean,
): string {
  const truncated =
    title.length > TRAY_TITLE_MAX_CHARS ? title.slice(0, TRAY_TITLE_MAX_CHARS) + "\u2026" : title;
  if (minsRemaining !== undefined && minsRemaining > 0) {
    if (inMeeting) {
      return truncated + " " + formatRemainingTime(minsRemaining);
    }
    const suffix = minsRemaining === 1 ? " in 1 min" : ` in ${minsRemaining} mins`;
    return truncated + suffix;
  }
  return truncated;
}

/**
 * Truncate a string to maxLen with an ellipsis when needed.
 * Exported for unit tests.
 */
export function truncateTrayTooltip(text: string, maxLen: number = TRAY_TOOLTIP_MAX_CHARS): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 1) return "\u2026";
  return text.slice(0, maxLen - 1) + "\u2026";
}

/**
 * Build the Windows tooltip string for a countdown (or idle/offline).
 * Exported for unit tests.
 */
export function buildWindowsTrayTooltip(
  title: string | null,
  minsRemaining?: number,
  inMeeting?: boolean,
  offline?: boolean,
): string {
  if (!title) {
    return offline ? OFFLINE_TRAY_TOOLTIP : DEFAULT_TRAY_TOOLTIP;
  }
  const label = formatTrayCountdownLabel(title, minsRemaining, inMeeting);
  const full = `${DEFAULT_TRAY_TOOLTIP} — ${label}`;
  return truncateTrayTooltip(full);
}

export function setupTray(mainWindow: BrowserWindow): void {
  // IMPORTANT: use nativeImage.createFromPath() — it understands asar virtual paths.
  // fs.readFileSync() does NOT resolve asar paths in the main process and will throw,
  // which silently prevents the tray from ever being created.
  tray = new Tray(buildIcon(nativeTheme.shouldUseDarkColors));
  lastToolTip = null;
  applyToolTip(DEFAULT_TRAY_TOOLTIP);

  themeListener = (): void => {
    tray?.setImage(buildIcon(nativeTheme.shouldUseDarkColors));
  };
  nativeTheme.on("updated", themeListener);

  if (!beforeQuitRegistered) {
    beforeQuitRegistered = true;
    app.once("before-quit", destroyTray);
  }

  if (!meetingsListener) {
    meetingsListener = (events: MeetingEvent[]): void => {
      cachedMeetings = events;
      refreshContextMenu(mainWindow);
    };
    mainBus.on("meeting-list-updated", meetingsListener);
  }

  if (!statusListener) {
    statusListener = (status: CalendarUiState): void => {
      cachedUi = status;
      if (status.events) {
        cachedMeetings = status.events;
      }
      refreshContextMenu(mainWindow);
      // Refresh idle tooltip if offline flag flipped while no countdown title
      if (!isDarwin() && lastToolTip !== null && !lastToolTip.includes(" — ")) {
        applyToolTip(status.offline ? OFFLINE_TRAY_TOOLTIP : DEFAULT_TRAY_TOOLTIP);
      }
    };
    mainBus.on("calendar-status-updated", statusListener);
  }

  refreshContextMenu(mainWindow);

  tray.on("click", () => {
    void forcePoll();
    // Windows: left-click should open the menu (right-click uses setContextMenu).
    // macOS: keep click = refresh only; menu is the status-item context menu.
    if (!isDarwin() && tray && lastContextMenu) {
      tray.popUpContextMenu(lastContextMenu);
    }
  });
}

/**
 * Destroy the tray and remove listeners.
 * Safe to call multiple times.
 */
export function destroyTray(): void {
  if (meetingsListener) {
    mainBus.off("meeting-list-updated", meetingsListener);
    meetingsListener = null;
  }
  if (statusListener) {
    mainBus.off("calendar-status-updated", statusListener);
    statusListener = null;
  }
  cachedMeetings = null;
  cachedUi = null;
  lastToolTip = null;
  lastContextMenu = null;
  beforeQuitRegistered = false;
  if (themeListener) {
    nativeTheme.removeListener("updated", themeListener);
    themeListener = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/**
 * Update the tray countdown label.
 * - macOS: status item title via `tray.setTitle`
 * - Windows: length-capped tooltip via `tray.setToolTip` (skips no-op updates)
 */
export function updateTrayTitle(
  title: string | null,
  minsRemaining?: number,
  inMeeting?: boolean,
): void {
  if (!tray) return;

  if (isDarwin()) {
    if (!title) {
      tray.setTitle("");
      return;
    }
    tray.setTitle(formatTrayCountdownLabel(title, minsRemaining, inMeeting));
    return;
  }

  const offline = getCalendarUiState().offline;
  applyToolTip(buildWindowsTrayTooltip(title, minsRemaining, inMeeting, offline));
}
