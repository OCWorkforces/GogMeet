import { BrowserWindow, app, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPackageInfo } from "../utils/packageInfo.js";
import { readFileSync } from "node:fs";
import { SECURE_WEB_PREFERENCES } from "../utils/browser-window.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Reference to the singleton About BrowserWindow (null when not open). */
let aboutWindow: BrowserWindow | null = null;

/**
 * Sentinel URL used only to request close from the sandboxed about page.
 * Inline `onclick` / `window.close()` are unreliable under the app CSP
 * (`script-src 'self'`) and Chromium's script-close rules for main-created windows.
 * Navigation is intercepted in main and never loads.
 */
const ABOUT_CLOSE_URL = "https://gogmeet.local/__about_close__";

const aboutIconSvg = readFileSync(
  path.join(__dirname, "..", "..", "src", "assets", "about-icon.svg"),
  "utf-8",
);
const ABOUT_ICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(aboutIconSvg)}`;

function closeAboutWindow(win: BrowserWindow): void {
  if (!win.isDestroyed()) {
    win.close();
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
  <button type="button" id="about-close">Close</button>
</body>
</html>`;

  const win = new BrowserWindow({
    width: 360,
    height: 340,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    titleBarStyle: "hiddenInset",
    vibrancy: "under-window",
    visualEffectState: "active",
    show: false,
    webPreferences: { ...SECURE_WEB_PREFERENCES },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === packageJson.repository) {
      shell.openExternal(url).catch((err) => {
        console.error("[About] Failed to open repository URL:", err);
      });
    }
    return { action: "deny" };
  });

  // Block in-page navigations; treat the close sentinel as a main-process close request.
  // Global CSP (`script-src 'self'`) blocks inline onclick handlers on this data: page.
  const onNavigate = (event: { preventDefault: () => void; url: string }): void => {
    event.preventDefault();
    if (event.url === ABOUT_CLOSE_URL) {
      closeAboutWindow(win);
    }
  };
  win.webContents.on("will-navigate", onNavigate);
  win.webContents.on("will-frame-navigate", onNavigate);

  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      closeAboutWindow(win);
    }
  });

  win
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    .then(() => {
      if (win.isDestroyed()) return;
      // Wire the Close button without inline script (CSP-safe). Navigation is
      // intercepted above and closed from the main process.
      return win.webContents.executeJavaScript(
        `document.getElementById("about-close")?.addEventListener("click",()=>{location.href=${JSON.stringify(ABOUT_CLOSE_URL)};});`,
      );
    })
    .catch((err: unknown) => {
      console.error("[About] Failed to load or wire about window:", err);
    });

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
