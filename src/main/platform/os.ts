/**
 * OS platform helpers for Electron main.
 *
 * Distinct from `domain/services/platform.ts`, which detects **meeting** hosts
 * (Google Meet vs Zoom). This module is for `process.platform` only.
 */

/** True when running on macOS. */
export function isDarwin(): boolean {
  return process.platform === "darwin";
}

/** True when running on Windows. */
export function isWin32(): boolean {
  return process.platform === "win32";
}
