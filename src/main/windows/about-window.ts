import { BrowserWindow, app, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPackageInfo } from "../utils/packageInfo.js";
import { readFileSync } from "node:fs";
import { SECURE_WEB_PREFERENCES } from "../utils/browser-window.js";
import { bindWindowsThemeBackground, platformWindowChrome } from "../utils/window-chrome.js";
import { escapeHtml } from "../../shared/utils/escape-html.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Reference to the singleton About BrowserWindow (null when not open). */
let aboutWindow: BrowserWindow | null = null;

/**
 * Sentinel URL used only to request close from the sandboxed about page.
 * Inline scripts are blocked by the page CSP meta; Close is wired via
 * executeJavaScript + this sentinel, intercepted in main (never loads).
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

/** Allow only https repository URLs for shell.openExternal. */
export function isSafeAboutRepositoryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeAttr(str: string): string {
  return escapeHtml(str);
}

export function showAbout(_mainWindow: BrowserWindow): void {
  // Reuse existing about window if still alive
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  const packageJson = getPackageInfo();
  const version = escapeHtml(app.getVersion());
  const appName = escapeHtml(app.getName());
  const description = escapeHtml(packageJson.description);
  const author = escapeHtml(packageJson.author);
  const year = new Date().getFullYear();
  const rawRepo = packageJson.repository;
  const repoSafe = isSafeAboutRepositoryUrl(rawRepo) ? rawRepo : "";
  const repoAttr = escapeAttr(repoSafe);
  const repoHref =
    repoSafe.length > 0
      ? `href="${repoAttr}" target="_blank" rel="noopener noreferrer"`
      : `href="#" aria-disabled="true"`;

  // Classic macOS About box. data: HTML (no preload / loadWindowContent).
  // CSP is embedded as a meta tag; Close is CSP-safe via sentinel navigation.
  const html = `\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>About ${appName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    color-scheme: dark;
    --bg: #0d1117;
    --bg-solid: #0d1117;
    --text-primary: #f5f5f7;
    --text-secondary: #ebebf5;
    --text-tertiary: #98989d;
    --control-fill: rgba(255, 255, 255, 0.1);
    --control-fill-hover: rgba(255, 255, 255, 0.14);
    --control-border: rgba(255, 255, 255, 0.14);
    --accent: #0a84ff;
    --icon-shadow: 0 10px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.35);
    --edge: rgba(255, 255, 255, 0.08);
    --traffic-safe: 40px;
  }
  @media (prefers-contrast: more) {
    :root {
      --text-secondary: var(--text-primary);
      --text-tertiary: var(--text-primary);
      --control-border: var(--text-primary);
    }
  }
  html, body { height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif;
    background: #0d1117;
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100vh;
    -webkit-app-region: drag;
    user-select: none;
    -webkit-user-select: none;
    -webkit-font-smoothing: antialiased;
    padding: var(--traffic-safe) 28px 28px;
    position: relative;
  }
  body::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--edge), transparent);
    pointer-events: none;
  }
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    margin-top: 8px;
    animation: about-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes about-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .stage { animation: none; }
  }
  .app-icon {
    display: block;
    width: 96px;
    height: 96px;
    border-radius: 22%;
    box-shadow: var(--icon-shadow);
    margin-bottom: 18px;
    pointer-events: none;
  }
  h1 {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.15;
    margin-bottom: 6px;
    color: var(--text-primary);
  }
  .version {
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.01em;
    color: var(--text-secondary);
    margin-bottom: 10px;
    line-height: 1.3;
  }
  .copyright {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-tertiary);
    text-align: center;
    line-height: 1.45;
    letter-spacing: 0.01em;
    max-width: 260px;
    margin-bottom: 8px;
  }
  .blurb {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-tertiary);
    text-align: center;
    line-height: 1.4;
    max-width: 260px;
    margin-bottom: 18px;
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    -webkit-app-region: no-drag;
    width: 100%;
    margin-top: auto;
  }
  .repo-link {
    font-size: 12px;
    font-weight: 500;
    color: var(--accent);
    text-decoration: none;
    letter-spacing: -0.01em;
    padding: 4px 8px;
    border-radius: 6px;
    transition: opacity 0.12s ease-out, transform 0.1s ease-out;
  }
  .repo-link:hover { opacity: 0.85; }
  .repo-link:active { transform: scale(0.97); opacity: 0.75; }
  .repo-link[aria-disabled="true"] {
    opacity: 0.4;
    pointer-events: none;
  }
  button {
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: -0.01em;
    padding: 5px 22px;
    min-width: 72px;
    border-radius: 6px;
    border: 0.5px solid var(--control-border);
    background: var(--control-fill);
    color: var(--text-primary);
    cursor: pointer;
    -webkit-app-region: no-drag;
    transition: background-color 0.12s ease-out, transform 0.1s ease-out;
  }
  button:hover { background: var(--control-fill-hover); }
  button:active { transform: scale(0.97); }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .repo-link, button { transition: none; }
    .repo-link:active, button:active { transform: none; }
  }
</style>
</head>
<body>
  <div class="stage">
    <img class="app-icon" src="${ABOUT_ICON_DATA_URI}" width="96" height="96" alt="" />
    <h1>${appName}</h1>
    <p class="version">Version ${version}</p>
    <p class="copyright">Copyright © ${year} ${author}</p>
    <p class="blurb">${description}</p>
    <div class="actions">
      <a class="repo-link" ${repoHref} aria-label="View GogMeet on GitHub (opens in browser)">GitHub</a>
      <button type="button" id="about-close">Close</button>
    </div>
  </div>
</body>
</html>`;

  const chrome = platformWindowChrome("about");
  const win = new BrowserWindow({
    width: 320,
    height: 420,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // About is not a utility HUD — avoid stealing focus from other apps permanently.
    alwaysOnTop: false,
    show: false,
    ...chrome,
    webPreferences: { ...SECURE_WEB_PREFERENCES },
  });

  const unbindTheme = bindWindowsThemeBackground(win, "about");

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (repoSafe.length > 0 && url === repoSafe && isSafeAboutRepositoryUrl(url)) {
      shell.openExternal(url).catch((err) => {
        console.error("[About] Failed to open repository URL:", err);
      });
    }
    return { action: "deny" };
  });

  // Block in-page navigations; treat the close sentinel as a main-process close request.
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
      if (win.isDestroyed() || win.webContents.isDestroyed()) return;
      // Wire Close without inline script (CSP-safe). Navigation is intercepted above.
      return win.webContents.executeJavaScript(
        `document.getElementById("about-close")?.addEventListener("click",()=>{location.href=${JSON.stringify(ABOUT_CLOSE_URL)};});document.getElementById("about-close")?.focus();`,
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
    unbindTheme();
    if (aboutWindow === win) {
      aboutWindow = null;
    }
  });

  aboutWindow = win;
}
