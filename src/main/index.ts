import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupTray } from "./tray.js";
import { registerIpcHandlers } from "./ipc.js";
import { startScheduler, stopScheduler } from "./scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

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

// Must be called before app.whenReady() on macOS for iconPath to take effect
app.setAboutPanelOptions({
  applicationName: 'Google Meet',
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  credits: 'Developed by CCWorkforce Engineers',
  copyright: `© ${new Date().getFullYear()} CCWorkforce`,
  iconPath: path.join(__dirname, '..', '..', 'assets', 'google-meet-icon.png'),
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
  registerIpcHandlers(mainWindow);
  setupTray(mainWindow);
  startScheduler();
});

app.on("window-all-closed", () => {
  // Prevent default quit — tray-only app stays alive
  // No-op: keep app running in tray
});

app.on("before-quit", () => {
  // Allow quit from tray menu
  stopScheduler();
  if (mainWindow) {
    mainWindow.destroy();
  }
});
