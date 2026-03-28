import { app, BrowserWindow, dialog } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, shutdownApp } from "./lifecycle.js";
import { getPackageInfo } from "./utils/packageInfo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

// Suppress Chromium DNS address sorter warnings on macOS (Chromium bug 40445828).
// These fire on interfaces with missing netmask (VPNs, virtual interfaces) and are harmless.
// Setting log-level to 3 (ERROR) filters out WARNING-level Chromium messages.
app.commandLine.appendSwitch('log-level', '3');

// === Process-level error handlers ===
process.on("uncaughtException", (error: Error) => {
  console.error("[main] Uncaught exception:", error);
  if (!isDev) {
    dialog.showErrorBox("Unexpected Error", error.message || "An unexpected error occurred.");
    app.exit(1);
  }
});

process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  console.error("[main] Unhandled rejection at:", promise, "reason:", reason);
  // Do not exit on unhandled rejection - these are often recoverable
});

const packageJson = getPackageInfo();
const platform = [os.type(), os.release(), os.arch()].join(', ');

app.setAboutPanelOptions({
  applicationName: 'GogMeet',
  applicationVersion: app.getVersion(),
  copyright: `Developed by ${packageJson.author}`,
  version: platform,
});

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    vibrancy: "popover",
    visualEffectState: "active",
    titleBarStyle: "hidden",
    transparent: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    const devUrl =
      process.env["VITE_DEV_SERVER_URL"] ?? "http://localhost:5173";
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  // Intercept close/minimize → hide to tray
  win.on("close", (event) => {
    event.preventDefault();
    win.hide();
    app.dock?.hide();
  });

  win.on("minimize", () => {
    win.hide();
    app.dock?.hide();
  });

  // Hide when focus lost (popover behavior)
  win.on("blur", () => {
    if (!isDev) {
      win.hide();
      app.dock?.hide();
    }
  });

  return win;
}

app.whenReady().then(() => {
  // Hide from Dock immediately
  app.dock?.hide();

  mainWindow = createWindow();
  initializeApp(mainWindow);
});

app.on("window-all-closed", () => {
  // Prevent default quit — tray-only app stays alive
  // No-op: keep app running in tray
});

app.on("before-quit", () => {
  // Allow quit from tray menu
  shutdownApp();
  if (mainWindow) {
    mainWindow.destroy();
  }
});
