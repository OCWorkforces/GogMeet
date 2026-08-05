import { autoUpdater } from "electron-updater";
import type { UpdateCheckResult } from "electron-updater";
import { app, dialog, shell } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import log from "electron-log";

import { isDarwin, isWin32 } from "../platform/os.js";
import { getPackageInfo } from "../utils/packageInfo.js";

const execFileAsync = promisify(execFile);

const BACKGROUND_CHECK_DELAY_MS = 5000;
const CODESIGN_TIMEOUT_MS = 5000;
const CODESIGN_BIN = "/usr/bin/codesign";
/** Canonical Releases URL — pinned host/path; package.json may only confirm the same repo. */
export const CANONICAL_RELEASES_URL = "https://github.com/iWorkforces/GogMeet/releases";

export type UpdaterAvailability = { kind: "ready" } | { kind: "portable" } | { kind: "unpackaged" };

/** How this install may apply updates (resolved once per configure). */
export type UpdateInstallPolicy =
  | { kind: "disabled-unpackaged" }
  | { kind: "disabled-portable" }
  | { kind: "feed-only" }
  | { kind: "full" };

export type UpdaterUiState = "idle" | "checking" | "downloading" | "ready-to-install" | "error";

export interface UpdaterMenuPresentation {
  readonly label: string;
  readonly enabled: boolean;
}

/** True when this process is the electron-builder portable build (K26). */
export function isPortableInstall(): boolean {
  const portableDir = process.env["PORTABLE_EXECUTABLE_DIR"];
  if (typeof portableDir === "string" && portableDir.length > 0) {
    return true;
  }
  const portableFile = process.env["PORTABLE_EXECUTABLE_FILE"];
  if (typeof portableFile === "string" && portableFile.length > 0) {
    return true;
  }
  if (process.env["GOGMEET_PORTABLE"] === "1") {
    return true;
  }
  return false;
}

export function getUpdaterAvailability(): UpdaterAvailability {
  if (!app.isPackaged) {
    return { kind: "unpackaged" };
  }
  if (isPortableInstall()) {
    return { kind: "portable" };
  }
  return { kind: "ready" };
}

let uiState: UpdaterUiState = "idle";
let configured = false;
let backgroundScheduled = false;
/** Install capability applied at configure (`full` vs `feed-only`). */
let installMode: "full" | "feed-only" = "full";
/** True while a user-initiated check should surface dialogs. */
let userSessionActive = false;
/** Sync gate for the whole manual entry (including dialogs). */
let manualGate = false;
/** True while a message box from this module is open. */
let dialogOpen = false;
/** Prevents double error dialogs when both event + promise reject. */
let userErrorDialogShown = false;
/** Version string from last successful download (for Restart dialog). */
let readyVersion: string | null = null;
/** Single-flight electron-updater check promise (manual + background). */
let checkInFlight: Promise<UpdateCheckResult | null> | null = null;
/**
 * macOS install eligibility cache:
 * - true: Developer ID Application (auto-install eligible)
 * - false: unsigned / ad-hoc / other (feed-only)
 * - null: not probed
 */
let macInstallEligibleCache: boolean | null = null;
/** Optional listener so tray can rebuild “Checking…” labels. */
let uiStateListener: (() => void) | null = null;

type MessageBoxParams = {
  type?: "none" | "info" | "error" | "question" | "warning";
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
  title?: string;
  message: string;
  detail?: string;
};

type MessageBoxResult = { response: number };

/** Injected dialog host for tests. */
let showMessageBoxImpl: (options: MessageBoxParams) => Promise<MessageBoxResult> = (options) =>
  dialog.showMessageBox(options);
/** Injected open-external for tests. */
let openExternalImpl: (url: string) => Promise<void> = (url) => shell.openExternal(url);
/** Injected mac install-eligibility probe for tests. */
let macInstallEligibleProbe: (() => Promise<boolean>) | null = null;

export function getUpdaterUiState(): UpdaterUiState {
  return uiState;
}

export function getInstallModeForTests(): "full" | "feed-only" {
  return installMode;
}

export function getUpdaterMenuPresentation(): UpdaterMenuPresentation {
  if (dialogOpen || manualGate) {
    if (uiState === "ready-to-install") {
      return { label: "Restart to Update…", enabled: false };
    }
    if (uiState === "downloading") {
      return { label: "Downloading Update…", enabled: false };
    }
    if (uiState === "checking") {
      return { label: "Checking for Updates…", enabled: false };
    }
  }
  switch (uiState) {
    case "checking":
      return { label: "Checking for Updates…", enabled: false };
    case "downloading":
      return { label: "Downloading Update…", enabled: false };
    case "ready-to-install":
      // feed-only never arms ready-to-install; full mode allows re-offer
      return { label: "Restart to Update…", enabled: !dialogOpen };
    case "error":
    case "idle":
    default:
      return { label: "Check for Updates…", enabled: !manualGate && !dialogOpen };
  }
}

export function setUpdaterUiStateListener(listener: (() => void) | null): void {
  uiStateListener = listener;
}

/** Test-only: swap dialog / openExternal / codesign probe. */
export function _setAutoUpdaterTestHooks(hooks: {
  showMessageBox?: (options: MessageBoxParams) => Promise<MessageBoxResult>;
  openExternal?: (url: string) => Promise<void>;
  /** When set, overrides Developer ID eligibility probe (true = full install). */
  isMacInstallEligible?: () => Promise<boolean>;
}): void {
  if (hooks.showMessageBox) {
    showMessageBoxImpl = hooks.showMessageBox;
  }
  if (hooks.openExternal) {
    openExternalImpl = hooks.openExternal;
  }
  if (hooks.isMacInstallEligible) {
    macInstallEligibleProbe = hooks.isMacInstallEligible;
  }
}

function notifyUiListener(): void {
  try {
    uiStateListener?.();
  } catch (err: unknown) {
    log.error("[auto-updater] uiStateListener failed:", err);
  }
}

function setUiState(next: UpdaterUiState): void {
  if (uiState === next) return;
  uiState = next;
  notifyUiListener();
}

/**
 * Safe Releases URL: pinned to iWorkforces/GogMeet on github.com, or package
 * repository only when it matches that host+path.
 */
export function releasesUrl(): string {
  try {
    const info = getPackageInfo();
    const base = info.repository.replace(/\/$/, "");
    const parsed = new URL(base);
    if (
      parsed.protocol === "https:" &&
      parsed.hostname === "github.com" &&
      parsed.username === "" &&
      parsed.password === "" &&
      (parsed.pathname === "/iWorkforces/GogMeet" || parsed.pathname === "/iWorkforces/GogMeet/")
    ) {
      return `${base}/releases`;
    }
  } catch {
    // fall through
  }
  return CANONICAL_RELEASES_URL;
}

async function openReleasesPage(): Promise<void> {
  const url = releasesUrl();
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "github.com" ||
      !parsed.pathname.startsWith("/iWorkforces/GogMeet")
    ) {
      log.error("[auto-updater] Refusing to open non-canonical releases URL");
      return;
    }
  } catch {
    log.error("[auto-updater] Refusing to open invalid releases URL");
    return;
  }
  try {
    await openExternalImpl(url);
  } catch (err: unknown) {
    log.error("[auto-updater] openExternal failed:", err);
  }
}

async function showInfoDialog(
  message: string,
  detail?: string,
  buttons: string[] = ["OK"],
): Promise<number> {
  dialogOpen = true;
  try {
    notifyUiListener();
    const result = await showMessageBoxImpl({
      type: "info",
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
      title: "GogMeet Updates",
      message,
      ...(detail !== undefined ? { detail } : {}),
    });
    return result.response;
  } finally {
    dialogOpen = false;
    notifyUiListener();
  }
}

/**
 * Resolve path to the .app bundle from the running executable (macOS).
 * Exported for unit tests.
 */
export function macAppBundlePathFromExe(exePath: string): string | null {
  // …/GogMeet.app/Contents/MacOS/GogMeet → …/GogMeet.app
  const macosDir = path.dirname(exePath);
  const contentsDir = path.dirname(macosDir);
  const appDir = path.dirname(contentsDir);
  if (appDir.endsWith(".app")) {
    return appDir;
  }
  return null;
}

/**
 * True when codesign -dvv reports Developer ID Application (not ad-hoc / other).
 * Exported for unit tests of the parser.
 */
export function parseMacDeveloperIdFromCodesignDvv(stderrOrStdout: string): boolean {
  // Reject explicit ad-hoc markers
  if (/Signature=adhoc/i.test(stderrOrStdout) || /flags=.*adhoc/i.test(stderrOrStdout)) {
    return false;
  }
  // Require Developer ID Application authority line
  return /Authority=Developer ID Application:/i.test(stderrOrStdout);
}

/**
 * Probe whether this macOS install is eligible for Squirrel auto-install
 * (Developer ID Application). Cached for the process lifetime.
 */
export async function isMacInstallEligible(): Promise<boolean> {
  if (!isDarwin()) {
    return false;
  }
  if (macInstallEligibleProbe) {
    return macInstallEligibleProbe();
  }
  if (macInstallEligibleCache !== null) {
    return macInstallEligibleCache;
  }
  const exe = app.getPath("exe");
  const bundle = macAppBundlePathFromExe(exe);
  const target = bundle ?? exe;
  try {
    await execFileAsync(CODESIGN_BIN, ["--verify", "--verbose=0", target], {
      timeout: CODESIGN_TIMEOUT_MS,
    });
  } catch {
    macInstallEligibleCache = false;
    return false;
  }
  // codesign -dvv prints certificate chain to stderr (exit may be 0 or non-zero).
  let detail: string;
  try {
    const { stderr, stdout } = await execFileAsync(CODESIGN_BIN, ["-dvv", target], {
      timeout: CODESIGN_TIMEOUT_MS,
      encoding: "utf8",
    });
    detail = `${stderr ?? ""}\n${stdout ?? ""}`;
  } catch (err: unknown) {
    const e = err as { stderr?: string | Buffer; stdout?: string | Buffer };
    detail = `${e.stderr?.toString() ?? ""}\n${e.stdout?.toString() ?? ""}`;
  }
  macInstallEligibleCache = parseMacDeveloperIdFromCodesignDvv(detail);
  log.info(`[auto-updater] macOS install eligible (Developer ID): ${macInstallEligibleCache}`);
  return macInstallEligibleCache;
}

/**
 * Resolve install policy for this process (availability + mac Developer ID).
 */
export async function getUpdateInstallPolicy(): Promise<UpdateInstallPolicy> {
  const availability = getUpdaterAvailability();
  if (availability.kind === "unpackaged") {
    return { kind: "disabled-unpackaged" };
  }
  if (availability.kind === "portable") {
    return { kind: "disabled-portable" };
  }
  if (isDarwin()) {
    const eligible = await isMacInstallEligible();
    return eligible ? { kind: "full" } : { kind: "feed-only" };
  }
  // Windows packaged non-portable: full NSIS path (sha512 always; Authenticode
  // when publisherName is present in app-update.yml from a signed build).
  return { kind: "full" };
}

/**
 * Windows: electron-updater skips Authenticode when publisherName is absent.
 * GOGMEET_UNSIGNED=1 forces skip only on packaged dogfood (never unpackaged).
 */
function applyWindowsSignaturePolicy(): void {
  if (!isWin32()) return;
  if (!app.isPackaged) return;
  if (process.env["GOGMEET_UNSIGNED"] !== "1") return;
  try {
    const nsis = autoUpdater as unknown as {
      verifyUpdateCodeSignature: (
        _publisherNames: string[],
        _path: string,
      ) => Promise<string | null>;
    };
    nsis.verifyUpdateCodeSignature = async () => null;
    log.info("[auto-updater] Windows signature verify skipped (GOGMEET_UNSIGNED=1)");
  } catch (err: unknown) {
    log.warn("[auto-updater] Could not override Windows signature verify:", err);
  }
}

async function showUserErrorDialog(message: string, detail: string): Promise<void> {
  if (!userSessionActive || userErrorDialogShown) return;
  userErrorDialogShown = true;
  setUiState("error");
  await showInfoDialog(message, detail);
  userSessionActive = false;
  setUiState(readyVersion && installMode === "full" ? "ready-to-install" : "idle");
}

function wireEventListeners(): void {
  autoUpdater.on("checking-for-update", () => {
    log.info("[auto-updater] Checking for update…");
    if (userSessionActive) {
      setUiState("checking");
    }
  });

  autoUpdater.on("update-available", (info) => {
    log.info(`[auto-updater] Update available: v${info.version}`);
    if (userSessionActive && installMode === "full") {
      setUiState("downloading");
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info(`[auto-updater] No update (latest feed v${info.version})`);
  });

  autoUpdater.on("download-progress", (progress) => {
    if (userSessionActive && installMode === "full" && uiState !== "downloading") {
      setUiState("downloading");
    }
    log.debug?.(
      `[auto-updater] Download ${Math.round(progress.percent)}% (${progress.transferred}/${progress.total})`,
    );
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info(`[auto-updater] Update downloaded: v${info.version}`);
    if (installMode !== "full") {
      // Should not download in feed-only; never arm install-on-quit UI.
      log.info("[auto-updater] Ignoring download for feed-only install policy");
      return;
    }
    readyVersion = info.version;
    setUiState("ready-to-install");
    // Manual path presents after downloadPromise; background stays quiet (label only).
  });

  autoUpdater.on("error", (err) => {
    log.error("[auto-updater] Update error:", err);
    if (userSessionActive) {
      const msg =
        uiState === "downloading" ? "Couldn’t download the update" : "Couldn’t check for updates";
      void showUserErrorDialog(
        msg,
        "Check your network connection and try again. Details are in the log.",
      );
    } else if (uiState !== "ready-to-install") {
      setUiState("idle");
    }
  });
}

/**
 * Configure electron-updater once for packaged non-portable installs.
 * Applies full vs feed-only policy (mac Developer ID).
 */
async function ensureConfigured(): Promise<boolean> {
  const availability = getUpdaterAvailability();
  if (availability.kind !== "ready") {
    return false;
  }
  if (configured) {
    return true;
  }

  const policy = await getUpdateInstallPolicy();
  if (policy.kind !== "full" && policy.kind !== "feed-only") {
    return false;
  }

  installMode = policy.kind === "full" ? "full" : "feed-only";
  autoUpdater.logger = log;
  autoUpdater.autoDownload = installMode === "full";
  autoUpdater.autoInstallOnAppQuit = installMode === "full";
  applyWindowsSignaturePolicy();
  wireEventListeners();
  configured = true;
  log.info(
    `[auto-updater] Configured installMode=${installMode} autoDownload=${autoUpdater.autoDownload}`,
  );
  return true;
}

/** Single-flight check shared by background and manual paths. */
function runCheckForUpdates(): Promise<UpdateCheckResult | null> {
  if (checkInFlight) {
    log.info("[auto-updater] checkForUpdates already in flight — joining");
    return checkInFlight;
  }
  checkInFlight = autoUpdater
    .checkForUpdates()
    .catch((err: unknown) => {
      // Re-throw after clearing so waiters see failure; error event also fires.
      throw err;
    })
    .finally(() => {
      checkInFlight = null;
    }) as Promise<UpdateCheckResult | null>;
  return checkInFlight;
}

async function presentReadyToInstallDialog(version: string): Promise<void> {
  if (installMode !== "full") {
    const response = await showInfoDialog(
      `Version ${version} is available`,
      "Automatic install isn’t available for this build. Open the release page to download the update.",
      ["Open Releases", "Later"],
    );
    if (response === 0) {
      await openReleasesPage();
    }
    userSessionActive = false;
    setUiState("idle");
    readyVersion = null;
    return;
  }

  const response = await showInfoDialog(
    `Version ${version} is ready to install`,
    "Restart GogMeet to apply the update now, or choose Later to install when you quit.",
    ["Restart Now", "Later"],
  );
  userSessionActive = false;
  if (response === 0) {
    log.info("[auto-updater] User chose Restart Now");
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (err: unknown) {
      log.error("[auto-updater] quitAndInstall failed:", err);
      setUiState("error");
      const r = await showInfoDialog(
        "Couldn’t install the update",
        "Try quitting GogMeet and reopening it, or download the latest release from GitHub.",
        ["Open Releases", "OK"],
      );
      if (r === 0) await openReleasesPage();
      setUiState("ready-to-install");
    }
  } else {
    log.info("[auto-updater] User chose Later — will install on quit");
    setUiState("ready-to-install");
  }
}

/**
 * Initialize electron-updater for packaged non-portable installs.
 * Background check is quiet (log only). Manual checks use checkForUpdatesManual().
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }

  if (isPortableInstall()) {
    log.info("[auto-updater] Portable install — updates disabled");
    return;
  }

  if (backgroundScheduled) {
    return;
  }
  backgroundScheduled = true;

  // Quiet startup check — short delay so init is not blocked
  setTimeout(() => {
    void (async () => {
      if (manualGate || userSessionActive || dialogOpen) {
        log.info("[auto-updater] Skipping background check (manual session active)");
        return;
      }
      if (!(await ensureConfigured())) {
        return;
      }
      if (manualGate || userSessionActive || dialogOpen) {
        return;
      }
      try {
        await runCheckForUpdates();
      } catch (err: unknown) {
        log.error("[auto-updater] background checkForUpdates failed:", err);
      }
    })();
  }, BACKGROUND_CHECK_DELAY_MS);
}

/**
 * User-initiated “Check for Updates…” from the tray menu.
 * Always surfaces a dialog for terminal outcomes (unsupported, up-to-date, ready, error).
 */
export async function checkForUpdatesManual(): Promise<void> {
  // Sync re-entry: dialog open or another manual already running
  if (manualGate || dialogOpen) {
    return;
  }
  manualGate = true;
  notifyUiListener();

  try {
    const availability = getUpdaterAvailability();

    if (availability.kind === "unpackaged") {
      await showInfoDialog(
        "Updates are only available in packaged installs",
        "Run a packaged build (DMG/NSIS) to check for and install updates.",
      );
      return;
    }

    if (availability.kind === "portable") {
      const response = await showInfoDialog(
        "Portable builds can’t auto-update",
        "Download the latest installer from GitHub Releases and replace this portable copy.",
        ["Open Releases", "OK"],
      );
      if (response === 0) {
        await openReleasesPage();
      }
      return;
    }

    // Already have a downloaded update — offer install again (full mode only).
    if (uiState === "ready-to-install" && readyVersion && installMode === "full") {
      userSessionActive = true;
      userErrorDialogShown = false;
      await presentReadyToInstallDialog(readyVersion);
      return;
    }

    if (uiState === "checking" || uiState === "downloading") {
      return;
    }

    if (!(await ensureConfigured())) {
      await showInfoDialog("Updates are not available for this install.");
      return;
    }

    userSessionActive = true;
    userErrorDialogShown = false;
    setUiState("checking");

    // feed-only (unsigned / ad-hoc mac): compare feed, never download/install.
    if (installMode === "feed-only") {
      try {
        const result = await runCheckForUpdates();
        if (!result || !result.isUpdateAvailable) {
          await showInfoDialog(`GogMeet is up to date (v${app.getVersion()})`);
          setUiState("idle");
        } else {
          const version = result.updateInfo.version;
          const response = await showInfoDialog(
            `Version ${version} is available`,
            "Automatic install isn’t available for this build. Open the release page to download the update.",
            ["Open Releases", "Later"],
          );
          if (response === 0) {
            await openReleasesPage();
          }
          setUiState("idle");
        }
      } catch (err: unknown) {
        log.error("[auto-updater] manual check failed (feed-only):", err);
        await showUserErrorDialog(
          "Couldn’t check for updates",
          "Check your network connection and try again. Details are in the log.",
        );
      } finally {
        userSessionActive = false;
      }
      return;
    }

    // full install mode
    try {
      const result = await runCheckForUpdates();
      if (!result) {
        await showInfoDialog("Updates are not available for this install.");
        userSessionActive = false;
        setUiState("idle");
        return;
      }

      if (!result.isUpdateAvailable) {
        await showInfoDialog(`GogMeet is up to date (v${app.getVersion()})`);
        userSessionActive = false;
        setUiState("idle");
        return;
      }

      if (result.downloadPromise) {
        setUiState("downloading");
        try {
          await result.downloadPromise;
          // Terminal guarantee: present dialog if download finished and we still own the session.
          if (userSessionActive && !dialogOpen) {
            if (readyVersion) {
              setUiState("ready-to-install");
              await presentReadyToInstallDialog(readyVersion);
            } else {
              // Event may have lagged — use feed version as display only; still require readyVersion for quitAndInstall safety
              const version = result.updateInfo.version;
              readyVersion = version;
              setUiState("ready-to-install");
              await presentReadyToInstallDialog(version);
            }
          }
        } catch (err: unknown) {
          log.error("[auto-updater] download failed:", err);
          await showUserErrorDialog(
            "Couldn’t download the update",
            "Check your network connection and try again. Details are in the log.",
          );
        }
        return;
      }

      // autoDownload false unexpected in full mode — fall back to Releases
      const version = result.updateInfo.version;
      const response = await showInfoDialog(
        `Version ${version} is available`,
        "Download the update from GitHub Releases.",
        ["Open Releases", "Later"],
      );
      if (response === 0) {
        await openReleasesPage();
      }
      userSessionActive = false;
      setUiState("idle");
    } catch (err: unknown) {
      log.error("[auto-updater] manual checkForUpdates failed:", err);
      await showUserErrorDialog(
        "Couldn’t check for updates",
        "Check your network connection and try again. Details are in the log.",
      );
    }
  } finally {
    manualGate = false;
    notifyUiListener();
  }
}

/** Test-only: reset module state between cases. */
export function _resetAutoUpdaterForTests(): void {
  uiState = "idle";
  configured = false;
  backgroundScheduled = false;
  installMode = "full";
  userSessionActive = false;
  manualGate = false;
  dialogOpen = false;
  userErrorDialogShown = false;
  readyVersion = null;
  checkInFlight = null;
  macInstallEligibleCache = null;
  uiStateListener = null;
  showMessageBoxImpl = (options) => dialog.showMessageBox(options);
  openExternalImpl = (url) => shell.openExternal(url);
  macInstallEligibleProbe = null;
}
