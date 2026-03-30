import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Shared secure webPreferences for all BrowserWindows.
 * Every window in this app MUST use these settings.
 */
export const SECURE_WEB_PREFERENCES = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
} as const;

/**
 * Returns the absolute path to the preload script.
 * Computed relative to the built utils/ directory → ../preload/index.cjs.
 */
export function getPreloadPath(): string {
  return path.join(__dirname, "..", "preload", "index.cjs");
}

/**
 * Load the appropriate HTML page into a BrowserWindow.
 * In dev: loads from the Vite dev server URL.
 * In prod: loads the built HTML file from the renderer directory.
 *
 * @param win - The BrowserWindow to load content into
 * @param page - The page name without extension (e.g. "index", "settings", "alert")
 */
export function loadWindowContent(win: BrowserWindow, page: string): void {
  if (!app.isPackaged) {
    const devUrl =
      process.env["VITE_DEV_SERVER_URL"] ?? "http://localhost:5173";
    win.loadURL(`${devUrl}/${page}.html`);
  } else {
    win.loadFile(path.join(__dirname, "..", "renderer", `${page}.html`));
  }
}
