import { BrowserWindow, app, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPackageInfo } from "../utils/packageInfo.js";
import { readFileSync } from "node:fs";
import { SECURE_WEB_PREFERENCES } from "../utils/browser-window.js";
import { platformWindowChrome } from "../utils/window-chrome.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * In-page navigation target used by the Close form.
 *
 * Inline `onclick` / scripts are blocked by the app CSP (`script-src 'self'`),
 * and `window.close()` is unreliable for main-created BrowserWindows. The
 * form navigates here; main intercepts and calls `win.close()`.
 */
const ABOUT_CLOSE_URL = "gogmeet://about-close";

/** Reference to the singleton About BrowserWindow (null when not open). */
let aboutWindow: BrowserWindow | null = null;

const aboutIconSvg = readFileSync(
  path.join(__dirname, "..", "..", "src", "assets", "about-icon.svg"),
  "utf-8",
);
const ABOUT_ICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(aboutIconSvg)}`;

function isAboutCloseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "gogmeet:" && parsed.hostname === "about-close";
  } catch {
    return false;
  }
}

export function showAbout(_mainWindow: BrowserWindow): void {
  // Reuse existing about window if still alive
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  const packageJson = getPackageInfo();
  const version = app.getVersion();
  const appName = app.getName();

  const html = `\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>About ${appName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
    background: #0d1017;
    color: #f5f5f7;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    -webkit-app-region: drag;
    user-select: none;
    -webkit-user-select: none;
  }
  .app-icon {
    width: 96px;
    height: 96px;
    margin-bottom: 16px;
    border-radius: 22px;
    box-shadow: 0 8px 32px rgba(66, 133, 244, 0.15);
    cursor: pointer;
  }
  a {
    text-decoration: none;
    -webkit-app-region: no-drag;
  }
  h1 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 14px;
  }
  .version {
    font-size: 13px;
    color: #98989d;
    margin-bottom: 18px;
  }
  .copyright {
    font-size: 12px;
    color: #98989d;
    text-align: center;
    line-height: 1.5;
    padding: 0 20px;
    margin-bottom: 24px;
  }
  .close-form {
    -webkit-app-region: no-drag;
  }
  button {
    font-family: inherit;
    font-size: 13px;
    padding: 6px 24px;
    border-radius: 6px;
    border: 1px solid #48484a;
    background: #2c2c2e;
    color: #f5f5f7;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  button:hover {
    background: #3a3a3c;
  }
  button:active {
    background: #48484a;
  }
</style>
</head>
<body>
  <a href="${packageJson.repository}" target="_blank">
    <img class="app-icon" src="${ABOUT_ICON_DATA_URI}" alt="${appName} icon" />
  </a>
  <h1>${appName}</h1>
  <div class="version">Version ${version}</div>
  <div class="copyright">${packageJson.description}</div>
  <form class="close-form" action="${ABOUT_CLOSE_URL}" method="get">
    <button type="submit">Close</button>
  </form>
</body>
</html>`;

  const chrome = platformWindowChrome("about");
  const win = new BrowserWindow({
    width: 360,
    height: 340,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    ...chrome,
    webPreferences: { ...SECURE_WEB_PREFERENCES },
  });

  const handleNavigation = (event: { preventDefault: () => void }, url: string): void => {
    event.preventDefault();
    if (isAboutCloseUrl(url) && !win.isDestroyed()) {
      win.close();
    }
  };

  win.webContents.on("will-navigate", (event, url) => {
    handleNavigation(event, url);
  });
  win.webContents.on("will-frame-navigate", (event) => {
    handleNavigation(event, event.url);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === packageJson.repository) {
      shell.openExternal(url).catch((err) => {
        console.error("[About] Failed to open repository URL:", err);
      });
    }
    return { action: "deny" };
  });

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.show();
  });

  win.on("closed", () => {
    if (aboutWindow === win) {
      aboutWindow = null;
    }
  });

  aboutWindow = win;
}
