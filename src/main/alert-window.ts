import { IPC_CHANNELS } from "../shared/types.js";
import type { MeetingEvent } from "../shared/types.js";
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
    height: 420,
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
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dev mode: load from dev server
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    alertWindow.loadURL(`${devUrl}alert.html`);
  } else {
    alertWindow.loadFile(
      path.join(__dirname, "..", "renderer", "alert.html"),
    );
  }

  alertWindow.once("ready-to-show", () => {
    alertWindow!.webContents.send(IPC_CHANNELS.ALERT_SHOW, event);
    alertWindow!.show();
  });

  alertWindow.on("closed", () => {
    alertWindow = null;
  });
}
