import { app, type BrowserWindow, session } from "electron";
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
  setupCspHeaders();
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  win.webContents.on("will-frame-navigate", (event) => {
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const load = !app.isPackaged
    ? () => {
        const devUrl = process.env["VITE_DEV_SERVER_URL"] ?? "http://localhost:5173";
        return win.loadURL(`${devUrl}/${page}.html`);
      }
    : () => win.loadFile(path.join(__dirname, "..", "renderer", `${page}.html`));

  load().catch((error: unknown) => {
    console.error("[browser-window] Failed to load content:", error);
  });
}

type CSPSource = `'self'` | `'unsafe-inline'` | `'none'` | `data:` | `ws://localhost:*`;
type CSPDirectiveName =
  | "default-src"
  | "script-src"
  | "style-src"
  | "img-src"
  | "font-src"
  | "connect-src"
  | "base-uri"
  | "object-src"
  | "frame-src"
  | "form-action";
type CSPDirective = `${CSPDirectiveName} ${CSPSource}${string}`;
type CSP = `${CSPDirective}` | `${CSPDirective}; ${string}`;

const CSP_BASE: CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; object-src 'none'; frame-src 'none'; form-action 'none'";

let cspHeadersConfigured = false;

/**
 * Enforce Content-Security-Policy via HTTP response headers for all windows.
 * In dev mode, adds `connect-src` for HMR WebSocket connections.
 */
export function setupCspHeaders(): void {
  if (cspHeadersConfigured) return;
  cspHeadersConfigured = true;

  const csp: CSP = app.isPackaged ? CSP_BASE : `${CSP_BASE}; connect-src 'self' ws://localhost:*`;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

/** Reset CSP configuration state — for tests only, not for production use */
export function _resetCspForTest(): void {
  cspHeadersConfigured = false;
}
