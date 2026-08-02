/**
 * Platform-specific BrowserWindow chrome defaults.
 *
 * macOS keeps vibrancy / hidden title bars. Windows uses opaque windows
 * without mac-only options that can warn or misbehave under Electron.
 */

import type { BrowserWindow } from "electron";
import { nativeTheme } from "electron";

import { isDarwin } from "../platform/os.js";

/** Surfaces that need platform chrome defaults. */
export type WindowChromeKind = "popover" | "settings" | "alert" | "about";

/**
 * Subset of BrowserWindow options that differ by OS.
 * Callers spread these into their constructor options.
 */
export type PlatformWindowChrome = {
  readonly vibrancy?: "popover" | "under-window";
  readonly visualEffectState?: "active";
  readonly titleBarStyle?: "hidden" | "hiddenInset";
  readonly transparent?: boolean;
  readonly backgroundColor?: string;
  readonly hasShadow?: boolean;
};

/** Product canvas for Settings / About dialogs (matches renderer CSS). */
export const DIALOG_BACKGROUND_COLOR = "#0d1117" as const;

/** Solid fills for Windows (no vibrancy). */
export function windowsSolidBackgroundColor(kind: WindowChromeKind): string {
  switch (kind) {
    case "popover":
      // Tray popover stays dark for contrast against menu bar icons.
      return "#1c1c1e";
    case "settings":
    case "about":
      return DIALOG_BACKGROUND_COLOR;
    case "alert":
      return "#1c1c1e";
  }
}

/**
 * Return platform-appropriate chrome options for a window kind.
 * Always safe to spread; mac-only keys are omitted on Windows.
 */
export function platformWindowChrome(kind: WindowChromeKind): PlatformWindowChrome {
  if (!isDarwin()) {
    switch (kind) {
      case "popover":
        return {
          transparent: false,
          backgroundColor: windowsSolidBackgroundColor("popover"),
          hasShadow: true,
        };
      case "settings":
      case "about":
      case "alert":
        return {
          backgroundColor: windowsSolidBackgroundColor(kind),
        };
    }
  }

  switch (kind) {
    case "popover":
      return {
        vibrancy: "popover",
        visualEffectState: "active",
        titleBarStyle: "hidden",
        transparent: true,
        hasShadow: true,
      };
    case "settings":
    case "about":
      // Solid product canvas (#0d1117) — skip vibrancy so the hex reads true.
      return {
        titleBarStyle: "hiddenInset",
        backgroundColor: DIALOG_BACKGROUND_COLOR,
      };
    case "alert":
      return {
        titleBarStyle: "hiddenInset",
      };
  }
}

/**
 * Keep a Windows solid-background window in sync with OS light/dark changes.
 * No-op on Darwin (vibrancy follows the system).
 */
export function bindWindowsThemeBackground(win: BrowserWindow, kind: WindowChromeKind): () => void {
  if (isDarwin()) {
    return () => undefined;
  }
  const apply = (): void => {
    if (win.isDestroyed()) return;
    win.setBackgroundColor(windowsSolidBackgroundColor(kind));
  };
  nativeTheme.on("updated", apply);
  return () => {
    nativeTheme.removeListener("updated", apply);
  };
}

/**
 * Apply always-on-top (and macOS full-screen workspace) behavior for alerts.
 * Windows gets plain always-on-top without mac-only level/workspace APIs.
 */
export function applyAlertAlwaysOnTop(win: BrowserWindow): void {
  if (isDarwin()) {
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    return;
  }
  win.setAlwaysOnTop(true);
}
