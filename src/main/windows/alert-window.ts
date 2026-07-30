import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import type { AlertPayload } from "../../shared/alert.js";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import { BrowserWindow } from "electron";
import {
  SECURE_WEB_PREFERENCES,
  getPreloadPath,
  loadWindowContent,
} from "../utils/browser-window.js";
import { applyAlertAlwaysOnTop, platformWindowChrome } from "../utils/window-chrome.js";

import { typedSend } from "../ipc-handlers/shared.js";
import { cancelPendingBrowserOpen } from "../scheduler/facade.js";
import type { EventId, IsoUtc } from "../../domain/entities/brand.js";

function toAlertPayload(event: MeetingEvent, autoOpenAt?: IsoUtc): AlertPayload {
  const payload: AlertPayload = {
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    calendarName: event.calendarName,
    isAllDay: event.isAllDay,
    hasMeetUrl: !!event.meetUrl,
  };
  if (event.description !== undefined) {
    payload.description = event.description;
  }
  if (autoOpenAt !== undefined) {
    payload.autoOpenAt = autoOpenAt;
  }
  return payload;
}

let alertWindow: BrowserWindow | null = null;
let isAlertShowing = false;
const pendingAlerts: MeetingEvent[] = [];
/** Prefer hide/show reuse when the prior window is still alive (same security prefs). */
let reuseGeneration = 0;

function processNextAlert(): void {
  const next = pendingAlerts.shift();
  if (!next) return;
  // Defer to next tick so the just-dismissed window finishes hide/teardown cleanly
  setImmediate(() => {
    isAlertShowing = true;
    showAlertInternal(next);
  });
}

export function showAlert(event: MeetingEvent, autoOpenAt?: IsoUtc): void {
  const startMs = new Date(event.startDate).getTime();
  // Coalesce duplicates: skip if same uid+startMs is already showing or queued.
  // If same uid but different startMs, the meeting was rescheduled — replace in-place.
  if (
    isAlertShowing &&
    alertWindow &&
    !alertWindow.isDestroyed() &&
    alertWindow.__alertUid === event.id
  ) {
    if (alertWindow.__alertStartMs === startMs) {
      return;
    }
    // Rescheduled: reuse the live window with the new payload (no cancel of pending open —
    // same contract as the prior destroy/recreate path with __replacing).
    showAlertInternal(event, autoOpenAt);
    return;
  }
  const queuedIndex = pendingAlerts.findIndex((e) => e.id === event.id);
  if (queuedIndex !== -1) {
    const existing = pendingAlerts[queuedIndex];
    if (existing && new Date(existing.startDate).getTime() === startMs) {
      return;
    }
    // Replace queued entry in-place to preserve order.
    pendingAlerts[queuedIndex] = event;
    return;
  }

  if (isAlertShowing) {
    pendingAlerts.push(event);
    return;
  }

  isAlertShowing = true;
  showAlertInternal(event, autoOpenAt);
}

function presentAlertPayload(win: BrowserWindow, event: MeetingEvent, autoOpenAt?: IsoUtc): void {
  if (win.isDestroyed()) return;
  typedSend(win.webContents, IPC_CHANNELS.ALERT_SHOW, toAlertPayload(event, autoOpenAt));
  win.webContents
    .executeJavaScript(
      `(() => {
          const app = document.getElementById("app");
          const card = document.querySelector(".alert-card");
          if (!app || !card) return 0;
          const appStyles = window.getComputedStyle(app);
          const paddingTop = Number.parseFloat(appStyles.paddingTop) || 0;
          const paddingBottom = Number.parseFloat(appStyles.paddingBottom) || 0;
          return Math.ceil(card.getBoundingClientRect().height + paddingTop + paddingBottom);
        })()`,
    )
    .then((contentHeight: number) => {
      if (win.isDestroyed()) return;
      if (typeof contentHeight === "number" && contentHeight > 0) {
        const MIN_HEIGHT = 280;
        const MAX_HEIGHT = 480;
        const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(contentHeight)));
        win.setSize(500, clamped, false);
      }
      win.show();
    })
    .catch(() => {
      if (!win.isDestroyed()) win.show();
    });
}

function showAlertInternal(event: MeetingEvent, autoOpenAt?: IsoUtc): void {
  const startMs = new Date(event.startDate).getTime();
  reuseGeneration += 1;
  const generation = reuseGeneration;

  // Prefer reusing a hidden-but-alive window (same SECURE_WEB_PREFERENCES, no recreate).
  if (alertWindow && !alertWindow.isDestroyed()) {
    const win = alertWindow;
    win.__replacing = false;
    win.__alertUid = event.id;
    win.__alertStartMs = startMs;
    applyAlertAlwaysOnTop(win);
    if (win.isVisible()) {
      win.hide();
    }
    // Clear prior DOM then push the new synthetic generation's payload.
    void win.webContents
      .executeJavaScript(
        `(() => { const app = document.getElementById("app"); if (app) app.innerHTML = ""; return true; })()`,
      )
      .catch(() => undefined)
      .then(() => {
        if (win.isDestroyed() || generation !== reuseGeneration) return;
        presentAlertPayload(win, event, autoOpenAt);
      });
    return;
  }

  const chrome = platformWindowChrome("alert");
  const win = new BrowserWindow({
    width: 500,
    height: 480,
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
  alertWindow = win;
  win.__alertUid = event.id;
  win.__alertStartMs = startMs;
  applyAlertAlwaysOnTop(win);

  loadWindowContent(win, "alert");

  win.once("ready-to-show", () => {
    if (win.isDestroyed() || generation !== reuseGeneration) return;
    presentAlertPayload(win, event, autoOpenAt);
  });

  // Prefer hide over destroy so the next alert can reuse this window (same webPreferences).
  win.on("close", (event) => {
    if (win.__forceDestroy) return;
    event.preventDefault();
    if (!win.__replacing && win.__alertUid !== undefined) {
      cancelPendingBrowserOpen(win.__alertUid);
    }
    win.__replacing = false;
    if (!win.isDestroyed()) win.hide();
    isAlertShowing = false;
    processNextAlert();
  });

  win.on("closed", () => {
    if (alertWindow === win) {
      alertWindow = null;
    }
    isAlertShowing = false;
  });
}

/** Force-destroy any alert window (shutdown / tests). */
export function destroyAlertWindow(): void {
  if (alertWindow && !alertWindow.isDestroyed()) {
    alertWindow.__forceDestroy = true;
    alertWindow.destroy();
  }
  alertWindow = null;
  isAlertShowing = false;
  pendingAlerts.length = 0;
}

declare module "electron" {
  interface BrowserWindow {
    __alertUid?: EventId;
    __alertStartMs?: number;
    __replacing?: boolean;
    __forceDestroy?: boolean;
  }
}
