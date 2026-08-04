import { app, BrowserWindow, dialog } from "electron";
import os from "node:os";
import { initializeApp, shutdownApp } from "./app/lifecycle.js";
import { getPackageInfo } from "./utils/packageInfo.js";
import {
  SECURE_WEB_PREFERENCES,
  getPreloadPath,
  loadWindowContent,
} from "./utils/browser-window.js";
import { platformWindowChrome } from "./utils/window-chrome.js";
import { configureMainLogging, mainLog } from "./utils/log.js";
import { isPerfTraceEnabled, perfTrace } from "./utils/performance-trace.js";

const processStartMs = performance.now();
if (isPerfTraceEnabled()) {
  perfTrace({
    operation: "startup-phase",
    phase: "process-start",
    outcome: "ok",
    startMs: 0,
    durationMs: 0,
  });
}

// Suppress Chromium DNS address sorter warnings on macOS (Chromium bug 40445828).
// These fire on interfaces with missing netmask (VPNs, virtual interfaces) and are harmless.
// Setting log-level to 3 (ERROR) filters out WARNING-level Chromium messages.
app.commandLine.appendSwitch("log-level", "3");

// Enable strict sandboxing for all renderers (security best practice).
// Preload uses only contextBridge + ipcRenderer (sandbox-compatible).
app.enableSandbox();

// Single-instance lock: required for desktop OAuth loopback later and avoids
// duplicate trays/schedulers. Secondary launches exit immediately.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Tray-only app: nothing to focus. Reserved for future tray balloon / menu.
  });
}

configureMainLogging();

// === Process-level error handlers ===
process.on("uncaughtException", (error: Error) => {
  mainLog.error("Uncaught exception:", error);
  if (app.isPackaged) {
    dialog.showErrorBox("Unexpected Error", error.message || "An unexpected error occurred.");
    app.exit(1);
  }
});

process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  mainLog.error("Unhandled rejection at:", promise, "reason:", reason);
  // Do not exit on unhandled rejection - these are often recoverable
});

const packageJson = getPackageInfo();
const platform = [os.type(), os.release(), os.arch()].join(", ");

app.setAboutPanelOptions({
  applicationName: "GogMeet",
  applicationVersion: app.getVersion(),
  copyright: `Developed by ${packageJson.author}`,
  version: platform,
});

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const chrome = platformWindowChrome("popover");
  const win = new BrowserWindow({
    width: 360,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    ...chrome,
    webPreferences: {
      preload: getPreloadPath(),
      ...SECURE_WEB_PREFERENCES,
    },
  });

  loadWindowContent(win, "index");

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
    if (app.isPackaged) {
      win.hide();
      app.dock?.hide();
    }
  });

  return win;
}

// Only boot when we own the single-instance lock (quit path may still load this
// module briefly before exit completes).
if (gotSingleInstanceLock) {
  app.whenReady().then(async () => {
    if (isPerfTraceEnabled()) {
      perfTrace({
        operation: "startup-phase",
        phase: "electron-ready",
        outcome: "ok",
        startMs: processStartMs,
        durationMs: Math.max(0, performance.now() - processStartMs),
      });
    }
    // Hide from Dock immediately (no-op on platforms without a dock)
    app.dock?.hide();

    // Private packaged measurement mode (GOGMEET_PERF_PROBE). Absent → normal product boot.
    const probeEnv = process.env["GOGMEET_PERF_PROBE"];
    if (typeof probeEnv === "string" && probeEnv.length > 0) {
      const { preflightOrBlock, finalizeStartupProbe, runNamedProbeSurface } =
        await import("./app/performance-probe.js");
      const gate = preflightOrBlock();
      if (!gate.ok) {
        const blockedReason = gate.result.status === "ok" ? "unknown" : gate.result.reason;
        mainLog.error("[perf-probe] blocked:", blockedReason);
        app.exit(gate.result.status === "blocked" ? 2 : 1);
        return;
      }
      if (gate.mode === "startup") {
        const tWin = performance.now();
        mainWindow = createWindow();
        if (isPerfTraceEnabled()) {
          perfTrace({
            operation: "startup-phase",
            phase: "window-create-load",
            outcome: "ok",
            startMs: tWin,
            durationMs: Math.max(0, performance.now() - tWin),
          });
        }
        try {
          await initializeApp(mainWindow, { probeSafe: true });
          finalizeStartupProbe(gate.userDataPath);
          app.exit(0);
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          mainLog.error("[perf-probe] startup failed:", err);
          app.exit(1);
        }
        return;
      }
      const surface = await runNamedProbeSurface(gate.mode, gate.userDataPath);
      app.exit(surface.status === "ok" ? 0 : 1);
      return;
    }

    const tWin = performance.now();
    mainWindow = createWindow();
    if (isPerfTraceEnabled()) {
      perfTrace({
        operation: "startup-phase",
        phase: "window-create-load",
        outcome: "ok",
        startMs: tWin,
        durationMs: Math.max(0, performance.now() - tWin),
      });
    }
    initializeApp(mainWindow).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[main] initializeApp failed:", err);
      dialog.showErrorBox("GogMeet Startup Error", err.message);
      app.quit();
    });
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
}
