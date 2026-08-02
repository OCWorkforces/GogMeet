/**
 * Ref-counted Dock visibility for hide-cached dialogs (Settings, About).
 * Keeps the macOS Dock visible while any holder is open; hides only when
 * the last dialog releases. No-op on Windows (app.dock is undefined).
 */

import { app } from "electron";

let holders = 0;

/** Claim Dock visibility (idempotent per call — callers must pair with release). */
export function acquireDockVisibility(): void {
  holders += 1;
  if (holders === 1) {
    app.dock?.show();
  }
}

/** Drop one claim; hide Dock when none remain. */
export function releaseDockVisibility(): void {
  if (holders <= 0) {
    holders = 0;
    return;
  }
  holders -= 1;
  if (holders === 0) {
    app.dock?.hide();
  }
}

/** Test-only: reset refcount without touching Dock. */
export function resetDockVisibilityForTests(): void {
  holders = 0;
}

/** Test-only: current holder count. */
export function getDockVisibilityHoldersForTests(): number {
  return holders;
}
