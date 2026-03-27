import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import type { MeetingEvent } from "../shared/models.js";
import { BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let alertWindow: BrowserWindow | null = null;

export function showAlert(event: MeetingEvent): void {
  // Dismiss any existing alert
  if (alertWindow && !alertWindow.isDestroyed()) {
    alertWindow.close();
    alertWindow = null;
  }

  alertWindow = new BrowserWindow({
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
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dev mode: load from dev server
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    alertWindow.loadURL(`${devUrl}/alert.html`);
  } else {
    alertWindow.loadFile(path.join(__dirname, "..", "renderer", "alert.html"));
  }

  alertWindow.once("ready-to-show", () => {
    alertWindow!.webContents.send(IPC_CHANNELS.ALERT_SHOW, event);
    // Measure rendered content height before showing to avoid a visible resize flash
    setTimeout(() => {
      if (!alertWindow || alertWindow.isDestroyed()) return;
      alertWindow.webContents
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
          if (!alertWindow || alertWindow.isDestroyed()) return;
          if (typeof contentHeight === "number" && contentHeight > 0) {
            const MIN_HEIGHT = 280;
            const MAX_HEIGHT = 480;
            const clamped = Math.max(
              MIN_HEIGHT,
              Math.min(MAX_HEIGHT, Math.ceil(contentHeight)),
            );
            alertWindow.setSize(500, clamped, false);
          }
          alertWindow!.show();
        })
        .catch(() => {
          alertWindow?.show();
        });
    }, 150);
  });

  alertWindow.on("closed", () => {
    alertWindow = null;
  });
}
