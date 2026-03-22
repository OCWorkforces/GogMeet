import { IPC_CHANNELS } from "../shared/types.js";

import { BrowserWindow, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let alertWindow: BrowserWindow | null = null;

/**
 * Show a full-screen meeting alert overlay.
 * Displays meeting title with a large Join button.
 * Only one alert at a time — dismisses previous if still showing.
 */
export function showAlert(title: string, meetUrl?: string): void {
  // Dismiss any existing alert
  if (alertWindow && !alertWindow.isDestroyed()) {
    alertWindow.close();
    alertWindow = null;
  }

  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  alertWindow = new BrowserWindow({
    width: screenWidth,
    height: screenHeight,
    x: 0,
    y: 0,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    fullscreen: true,
    show: false,
    backgroundColor: "#1d1d1f",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  alertWindow.loadFile(path.join(__dirname, "..", "renderer", "alert.html"));
  alertWindow.once("ready-to-show", () => {
    alertWindow!.webContents.send(IPC_CHANNELS.ALERT_SHOW, {
      title,
      meetUrl: meetUrl ?? "",
    });
    alertWindow!.show();
  });

  alertWindow.on("closed", () => {
    alertWindow = null;
  });
}
