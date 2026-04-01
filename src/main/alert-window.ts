import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import type { MeetingEvent } from "../shared/models.js";
import { BrowserWindow } from "electron";
import {
  SECURE_WEB_PREFERENCES,
  getPreloadPath,
  loadWindowContent,
} from "./utils/browser-window.js";

let alertWindow: BrowserWindow | null = null;

export function showAlert(event: MeetingEvent): void {
  // Dismiss any existing alert
  if (alertWindow && !alertWindow.isDestroyed()) {
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

  loadWindowContent(win, "alert");

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.webContents.send(IPC_CHANNELS.ALERT_SHOW, event);
    // Measure rendered content height before showing to avoid a visible resize flash
    setTimeout(() => {
      if (win.isDestroyed()) return;
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
            const clamped = Math.max(
              MIN_HEIGHT,
              Math.min(MAX_HEIGHT, Math.ceil(contentHeight)),
            );
            win.setSize(500, clamped, false);
          }
          win.show();
        })
        .catch(() => {
          if (!win.isDestroyed()) win.show();
        });
    }, 150);
  });

  win.on("closed", () => {
    if (alertWindow === win) {
      alertWindow = null;
    }
  });
}
