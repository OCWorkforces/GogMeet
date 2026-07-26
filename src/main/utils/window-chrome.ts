/**
 * Platform-specific BrowserWindow chrome defaults.
 *
 * macOS keeps vibrancy / hidden title bars. Windows uses opaque windows
 * without mac-only options that can warn or misbehave under Electron.
 */

import type { BrowserWindow } from "electron";

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
          backgroundColor: "#1c1c1e",
          hasShadow: true,
        };
      case "settings":
      case "about":
      case "alert":
        return {
          backgroundColor: "#1c1c1e",
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
      return {
        titleBarStyle: "hiddenInset",
        vibrancy: "under-window",
        visualEffectState: "active",
      };
    case "alert":
      return {
        titleBarStyle: "hiddenInset",
      };
  }
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
