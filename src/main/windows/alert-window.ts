import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import type { AlertPayload } from "../../shared/alert.js";
import type { MeetingEvent } from "../../shared/meeting-event.js";
import { BrowserWindow } from "electron";
import {
  SECURE_WEB_PREFERENCES,
  getPreloadPath,
  loadWindowContent,
} from "../utils/browser-window.js";

import { typedSend } from "../ipc-handlers/shared.js";
import { cancelPendingBrowserOpen } from "../scheduler/facade.js";
import type { EventId, IsoUtc } from "../../shared/brand.js";

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

function processNextAlert(): void {
  const next = pendingAlerts.shift();
  if (!next) return;
  // Defer to next tick so the just-closed window finishes teardown cleanly
  setImmediate(() => showAlertInternal(next));
}

export function showAlert(event: MeetingEvent, autoOpenAt?: IsoUtc): void {
  const startMs = new Date(event.startDate).getTime();
  // Coalesce duplicates: skip if same uid+startMs is already showing or queued.
  // If same uid but different startMs, the meeting was rescheduled — replace.
  if (
    isAlertShowing &&
    alertWindow &&
    !alertWindow.isDestroyed() &&
    alertWindow.__alertUid === event.id
  ) {
    if (alertWindow.__alertStartMs === startMs) {
      return;
    }
    // Rescheduled: tear down current window and queue the new event.
    // Mark as replacing so the closed-handler does NOT cancel the pending browser-open.
    alertWindow.__replacing = true;
    alertWindow.close();
    alertWindow = null;
    isAlertShowing = false;
    pendingAlerts.push(event);
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

function showAlertInternal(event: MeetingEvent, autoOpenAt?: IsoUtc): void {
  // Dismiss any existing alert (defensive — should not happen given the queue)
  if (alertWindow && !alertWindow.isDestroyed()) {
    // Defensive teardown — treat as a replacement so we don't cancel a pending browser-open.
    alertWindow.__replacing = true;
    alertWindow.close();
    alertWindow = null;
  }

  const win = new BrowserWindow({
    width: 500,
    height: 480,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      ...SECURE_WEB_PREFERENCES,
    },
  });
  alertWindow = win;
  // Tag the window with its uid so we can coalesce while it's actively showing
  win.__alertUid = event.id;
  win.__alertStartMs = new Date(event.startDate).getTime();
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  loadWindowContent(win, "alert");

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    typedSend(win.webContents, IPC_CHANNELS.ALERT_SHOW, toAlertPayload(event, autoOpenAt));
    // Measure rendered content height before showing to avoid a visible resize flash.
    // ready-to-show fires when first paint is ready, so the DOM is laid out and
    // getBoundingClientRect() returns accurate values without an arbitrary timer.
    win.webContents
      .executeJavaScript(
        `(() => {
            const app = document.getElementById("app");
            const card = document.querySelector(".alert-card");

            if (!app || !card) {
              return 0;
            }

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
  });

  win.on("closed", () => {
    // If the user dismissed the alert (Cmd+W, red traffic light, etc.) — not a programmatic
    // replacement — cancel the pending browser-open for this event. Dismissing the alert is
    // an explicit "I do not want to join" signal.
    if (!win.__replacing && win.__alertUid !== undefined) {
      cancelPendingBrowserOpen(win.__alertUid);
    }
    if (alertWindow === win) {
      alertWindow = null;
    }
    isAlertShowing = false;
    processNextAlert();
  });
}

declare module "electron" {
  interface BrowserWindow {
    __alertUid?: EventId;
    __alertStartMs?: number;
    __replacing?: boolean;
  }
}
