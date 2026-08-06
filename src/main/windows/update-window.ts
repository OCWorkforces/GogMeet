/**
 * Native “Check for Updates…” dialog — data: HTML with brand aurora (About-style).
 * Replaces system message boxes for manual update checks. Hide-cached between
 * presentations; force-destroyed on quit/tests.
 *
 * CSP: script-src 'none' — Close / action buttons wired from main via
 * executeJavaScript + navigation sentinels (never load).
 */

import { BrowserWindow, app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { SECURE_WEB_PREFERENCES } from "../utils/browser-window.js";
import { bindWindowsThemeBackground, platformWindowChrome } from "../utils/window-chrome.js";
import { escapeHtml } from "../../shared/utils/escape-html.js";
import { APP_ICON_AURORA_CSS, appIconWithAuroraHtml } from "../../shared/utils/app-icon-aurora.js";
import { acquireDockVisibility, releaseDockVisibility } from "./dock-visibility.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Compatible with electron dialog.showMessageBox options used by auto-updater. */
export type UpdateDialogOptions = {
  type?: "none" | "info" | "error" | "question" | "warning";
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
  title?: string;
  message: string;
  detail?: string;
  /**
   * Visual phase:
   * - checking — aurora active, no primary actions; returns immediately so the poll can run
   * - result — terminal outcome; optional action buttons (omit buttons for dismiss-only via Escape / close)
   */
  phase?: "checking" | "result";
};

export type UpdateDialogResult = { response: number };

const ACTION_PREFIX = "https://gogmeet.local/__update_action__/";
const CLOSE_URL = "https://gogmeet.local/__update_close__";

const aboutIconSvg = readFileSync(
  path.join(__dirname, "..", "..", "src", "assets", "about-icon.svg"),
  "utf-8",
);
const ICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(aboutIconSvg)}`;

let updateWindow: BrowserWindow | null = null;
let unbindTheme: (() => void) | null = null;
let dockHeld = false;
/**
 * Generation for presentations. Bumped on each present, settle, and destroy so
 * in-flight loadURL completions never re-show or cancel a newer waiter.
 */
let dialogGeneration = 0;
/** Result-phase waiter (checking phase returns immediately and has no waiter). */
let pending: {
  gen: number;
  cancelId: number;
  resolve: (result: UpdateDialogResult) => void;
} | null = null;
/** Cancel index for the active presentation (Escape / traffic-light close). */
let activeCancelId = 0;
/** Button count for the active presentation (action sentinels clamped to this). */
let activeButtonCount = 0;
/** True while a presentUpdateDialog call is awaiting a user action. */
let dialogOpen = false;
/** Active visual phase (checking dismiss is tracked separately). */
let activePhase: "checking" | "result" = "result";
/**
 * True when the user dismissed the window during a checking/progress presentation
 * before a terminal result was shown. Scoped to the current manual session
 * (cleared by beginUpdateDialogSession).
 */
let sessionDismissed = false;

declare module "electron" {
  interface BrowserWindow {
    __forceDestroy?: boolean;
  }
}

function holdDock(): void {
  if (dockHeld) return;
  dockHeld = true;
  acquireDockVisibility();
}

function releaseDock(): void {
  if (!dockHeld) return;
  dockHeld = false;
  releaseDockVisibility();
}

function hideUpdateWindow(win: BrowserWindow): void {
  if (!win.isDestroyed() && win.isVisible()) {
    win.hide();
  }
  releaseDock();
}

function resolvePending(response: number): void {
  const current = pending;
  pending = null;
  dialogOpen = false;
  if (current) {
    current.resolve({ response });
  }
}

/**
 * Invalidate in-flight load completions for the presentation that is settling,
 * then hide and resolve any result waiter. Bumping generation first ensures a
 * late loadURL().then cannot re-show the window or cancel a newer waiter.
 */
function settleAndHide(response: number): void {
  if (activePhase === "checking") {
    sessionDismissed = true;
  }
  // Invalidate loads tied to this presentation (and any older ones).
  dialogGeneration += 1;
  const win = updateWindow;
  if (win && !win.isDestroyed()) {
    hideUpdateWindow(win);
  } else {
    releaseDock();
  }
  resolvePending(response);
}

export function isUpdateDialogOpen(): boolean {
  return dialogOpen;
}

/** Whether the user closed the dialog during the in-flight checking phase. */
export function isUpdateSessionDismissed(): boolean {
  return sessionDismissed;
}

/** Clear dismiss flag before starting a new manual check presentation. */
export function beginUpdateDialogSession(): void {
  sessionDismissed = false;
}

function phaseFromOptions(options: UpdateDialogOptions): "checking" | "result" {
  if (options.phase === "checking") return "checking";
  // Explicit result, or any non-checking presentation (including dismiss-only).
  return "result";
}

function visualKind(options: UpdateDialogOptions): "checking" | "error" | "success" | "info" {
  const phase = phaseFromOptions(options);
  if (phase === "checking") return "checking";
  if (options.type === "error") return "error";
  const msg = options.message.toLowerCase();
  if (msg.includes("up to date")) return "success";
  if (msg.includes("couldn’t") || msg.includes("couldn't") || msg.includes("could not")) {
    return "error";
  }
  return "info";
}

/**
 * Outer height by action row count (caller-supplied buttons only).
 * Dismiss-only results have no footer button — same compact height as checking.
 */
export function updateWindowHeightForButtonCount(buttonCount: number): number {
  if (buttonCount >= 2) return 400;
  if (buttonCount === 1) return 380;
  // Checking / progress / dismiss-only: Esc + traffic lights only
  return 340;
}

function buildHtml(options: UpdateDialogOptions): string {
  const title = escapeHtml(options.title ?? "GogMeet Updates");
  const message = escapeHtml(options.message);
  const detailRaw = options.detail ?? "";
  const detail = escapeHtml(detailRaw);
  const buttons = options.buttons ?? [];
  const defaultId = options.defaultId ?? 0;
  const phase = phaseFromOptions(options);
  const kind = visualKind(options);
  const isChecking = phase === "checking";
  /** Result with no API buttons: dismiss via Esc / window close only (no Close button). */
  const dismissOnly = !isChecking && buttons.length === 0;
  // Eyebrow only for active progress; terminal outcomes rely on the message alone.
  const statusLabel =
    kind === "checking"
      ? "Checking for updates"
      : kind === "error"
        ? "Something went wrong"
        : kind === "success"
          ? "You’re up to date"
          : "";

  const buttonHtml =
    isChecking || dismissOnly
      ? ""
      : buttons
          .map((label, index) => {
            const primary = index === defaultId;
            const cls = primary ? "btn btn--primary" : "btn";
            const safe = escapeHtml(label);
            return `<button type="button" class="${cls}" data-action="${index}" id="update-btn-${index}">${safe}</button>`;
          })
          .join("\n      ");

  const detailBlock =
    detailRaw.length > 0
      ? `<p class="detail" id="update-detail">${detail}</p>`
      : `<p class="detail detail--empty" id="update-detail" hidden></p>`;

  const checkingHint = isChecking
    ? `<p class="checking-hint" id="update-checking">This usually takes a few seconds…</p>
    <p class="dismiss-hint" id="update-dismiss-hint">Press Esc to close</p>`
    : dismissOnly
      ? `<p class="dismiss-hint" id="update-dismiss-hint">Press Esc to close</p>`
      : `<p class="checking-hint" id="update-checking" hidden></p>
    <p class="dismiss-hint" id="update-dismiss-hint" hidden></p>`;

  const ariaDescribedBy = [
    detailRaw.length > 0 ? "update-detail" : "",
    isChecking ? "update-checking" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    color-scheme: dark;
    --bg: #0d1117;
    --text-primary: #f5f5f7;
    --text-secondary: #ebebf5;
    --text-tertiary: #98989d;
    --control-fill: rgba(255, 255, 255, 0.1);
    --control-fill-hover: rgba(255, 255, 255, 0.14);
    --control-border: rgba(255, 255, 255, 0.14);
    --accent: #0a84ff;
    --accent-fill: rgba(10, 132, 255, 0.85);
    --accent-fill-hover: rgba(10, 132, 255, 0.95);
    --edge: rgba(255, 255, 255, 0.08);
    --traffic-safe: 40px;
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
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
    overflow-y: auto;
    -webkit-app-region: drag;
    user-select: none;
    -webkit-user-select: none;
    -webkit-font-smoothing: antialiased;
    padding: var(--traffic-safe) 28px 16px;
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
    margin-top: 4px;
    animation: update-in 0.32s var(--ease-out) both;
  }
  @keyframes update-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .stage { animation: none; }
  }
  ${APP_ICON_AURORA_CSS}
  .app-icon-aurora--update {
    margin-bottom: 12px;
  }
  .eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    margin-bottom: 6px;
  }
  h1 {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.25;
    text-align: center;
    margin-bottom: 6px;
    color: var(--text-primary);
    max-width: 280px;
  }
  .detail {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-tertiary);
    text-align: center;
    line-height: 1.45;
    letter-spacing: 0.01em;
    max-width: 280px;
    margin-bottom: 0;
  }
  .detail--empty { display: none; }
  .checking-hint {
    font-size: 11px;
    color: var(--text-tertiary);
    text-align: center;
    margin-top: 4px;
    margin-bottom: 0;
    opacity: 0.85;
  }
  .dismiss-hint {
    font-size: 11px;
    color: var(--text-tertiary);
    text-align: center;
    margin-top: 8px;
    opacity: 0.75;
  }
  .dismiss-hint--subtle {
    margin-top: 6px;
    margin-bottom: 0;
    opacity: 0.65;
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    -webkit-app-region: no-drag;
    width: 100%;
    max-width: 220px;
    margin-top: 16px;
    padding-top: 0;
  }
  .actions:empty { display: none; }
  .btn {
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: -0.01em;
    padding: 7px 16px;
    border-radius: 6px;
    border: 0.5px solid var(--control-border);
    background: var(--control-fill);
    color: var(--text-primary);
    cursor: pointer;
    -webkit-app-region: no-drag;
    transition: background-color 0.12s ease, transform 0.1s var(--ease-out);
  }
  .btn:hover { background: var(--control-fill-hover); }
  .btn:active { transform: scale(0.97); }
  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .btn--primary {
    background: var(--accent-fill);
    border-color: transparent;
    color: #fff;
  }
  .btn--primary:hover { background: var(--accent-fill-hover); }
  @media (prefers-reduced-motion: reduce) {
    .btn { transition: none; }
    .btn:active { transform: none; }
  }
</style>
</head>
<body
  role="dialog"
  aria-modal="true"
  aria-labelledby="update-message"
  ${ariaDescribedBy ? `aria-describedby="${ariaDescribedBy}"` : ""}
  data-phase="${isChecking ? "checking" : "result"}"
  data-kind="${kind}"
>
  <div class="stage">
    ${appIconWithAuroraHtml(ICON_DATA_URI, { size: 88, className: "app-icon-aurora--update app-icon-aurora--about" })}
    ${
      statusLabel.length > 0
        ? `<p class="eyebrow" id="update-eyebrow">${escapeHtml(statusLabel)}</p>`
        : `<p class="eyebrow" id="update-eyebrow" hidden></p>`
    }
    <h1 id="update-message">${message}</h1>
    ${detailBlock}
    ${checkingHint}
    <div class="actions" id="update-actions">
      ${buttonHtml}
    </div>
  </div>
</body>
</html>`;
}

function wireActionHandlers(win: BrowserWindow, buttonCount: number, defaultId: number): void {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return;
  const parts: string[] = [];
  for (let i = 0; i < buttonCount; i++) {
    parts.push(
      `document.getElementById(${JSON.stringify(`update-btn-${i}`)})?.addEventListener("click",()=>{location.href=${JSON.stringify(`${ACTION_PREFIX}${i}`)};});`,
    );
  }
  if (buttonCount > 0) {
    parts.push(`document.getElementById(${JSON.stringify(`update-btn-${defaultId}`)})?.focus();`);
  }
  void win.webContents.executeJavaScript(parts.join("")).catch(() => undefined);
}

/** Outer chrome width — keep in sync with BrowserWindow constructor. */
const UPDATE_WINDOW_WIDTH = 340;

/** Active outer height for the current presentation (set in presentUpdateDialog). */
let activeWindowHeight = updateWindowHeightForButtonCount(0);

function presentWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  // Re-assert size so hide-cache windows pick up layout tweaks after rebuilds.
  if (typeof win.setSize === "function") {
    win.setSize(UPDATE_WINDOW_WIDTH, activeWindowHeight);
  }
  // Always show — dialog may already be "visible" after hide/show reuse.
  win.show();
  holdDock();
  win.focus();
}

function ensureWindow(): BrowserWindow {
  if (updateWindow && !updateWindow.isDestroyed()) {
    return updateWindow;
  }

  const chrome = platformWindowChrome("update");
  const win = new BrowserWindow({
    width: UPDATE_WINDOW_WIDTH,
    height: activeWindowHeight,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    show: false,
    ...chrome,
    webPreferences: { ...SECURE_WEB_PREFERENCES },
  });

  unbindTheme?.();
  unbindTheme = bindWindowsThemeBackground(win, "update");

  const onNavigate = (event: { preventDefault: () => void; url: string }): void => {
    event.preventDefault();
    const { url } = event;
    if (url === CLOSE_URL) {
      settleAndHide(activeCancelId);
      return;
    }
    if (url.startsWith(ACTION_PREFIX)) {
      const raw = url.slice(ACTION_PREFIX.length);
      const index = Number.parseInt(raw, 10);
      if (Number.isFinite(index) && index >= 0 && index < activeButtonCount) {
        settleAndHide(index);
      }
    }
  };
  win.webContents.on("will-navigate", onNavigate);
  win.webContents.on("will-frame-navigate", onNavigate);

  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      settleAndHide(activeCancelId);
    }
  });

  win.on("close", (event) => {
    if (win.__forceDestroy) return;
    event.preventDefault();
    settleAndHide(activeCancelId);
  });

  win.on("closed", () => {
    unbindTheme?.();
    unbindTheme = null;
    releaseDock();
    if (updateWindow === win) {
      updateWindow = null;
    }
    // If destroyed while waiting, resolve cancel so auto-updater unblocks.
    if (pending) {
      const cancel = pending.cancelId;
      dialogGeneration += 1;
      resolvePending(cancel);
    }
  });

  updateWindow = win;
  return win;
}

/**
 * Show the native update dialog and resolve when the user picks a button,
 * presses Escape, or closes the window (cancelId).
 *
 * Compatible with the auto-updater `showMessageBox` hook shape.
 */
export async function presentUpdateDialog(
  options: UpdateDialogOptions,
): Promise<UpdateDialogResult> {
  // Supersede any in-flight result waiter with *its* cancelId (not the new one).
  if (pending) {
    const prev = pending;
    pending = null;
    dialogOpen = false;
    prev.resolve({ response: prev.cancelId });
  }

  const phase = phaseFromOptions(options);
  const buttons = options.buttons ?? [];
  // Dismiss-only (no buttons): Escape/close → 0. With buttons: default cancel is last.
  // Callers may pass cancelId beyond the last index (e.g. single "Open Releases" + Escape dismiss).
  const cancelId = options.cancelId ?? (buttons.length > 0 ? buttons.length - 1 : 0);
  const defaultId = options.defaultId ?? 0;
  activeCancelId = cancelId;
  activeButtonCount = buttons.length;
  activePhase = phase;
  activeWindowHeight = updateWindowHeightForButtonCount(phase === "checking" ? 0 : buttons.length);
  // Checking phase owns sessionDismissed clear only when beginUpdateDialogSession
  // was not already called; still safe to clear here for isolated checking presents.
  if (phase === "checking") {
    sessionDismissed = false;
  }
  dialogOpen = true;
  const gen = ++dialogGeneration;

  const win = ensureWindow();
  const html = buildHtml({ ...options, buttons });
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  // Checking / progress: return immediately so the updater can poll;
  // window stays open until a result presentation or user dismiss.
  if (phase === "checking") {
    await win.loadURL(url).catch((err: unknown) => {
      console.error("[Update] Failed to load update dialog:", err);
    });
    // Only show if this presentation was not settled (Escape/close) mid-load.
    if (!win.isDestroyed() && gen === dialogGeneration) {
      wireActionHandlers(win, 0, 0);
      presentWindow(win);
    }
    return { response: -1 };
  }

  // Result phase (with or without buttons): wait for action or Escape/close.
  return new Promise<UpdateDialogResult>((resolve) => {
    pending = { gen, cancelId, resolve };

    void win
      .loadURL(url)
      .catch((err: unknown) => {
        console.error("[Update] Failed to load update dialog:", err);
      })
      .then(() => {
        // Stale load: never cancel a newer waiter and never re-show.
        if (win.isDestroyed() || gen !== dialogGeneration) {
          return;
        }
        if (!pending || pending.gen !== gen) {
          return;
        }
        wireActionHandlers(win, buttons.length, defaultId);
        presentWindow(win);
      });
  });
}

/**
 * Force-destroy the cached update window (shutdown / tests).
 */
export function destroyUpdateWindow(): void {
  dialogGeneration += 1;
  if (pending) {
    const p = pending;
    pending = null;
    dialogOpen = false;
    p.resolve({ response: p.cancelId });
  }
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.__forceDestroy = true;
    updateWindow.destroy();
  }
  updateWindow = null;
  unbindTheme?.();
  unbindTheme = null;
  releaseDock();
  dialogOpen = false;
  activePhase = "result";
  activeButtonCount = 0;
  sessionDismissed = false;
}

/** App version string for dialogs that mention it (pure helper for tests). */
export function updateDialogAppVersion(): string {
  return app.getVersion();
}
