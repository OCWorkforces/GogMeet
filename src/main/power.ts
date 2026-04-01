import { powerMonitor, powerSaveBlocker } from "electron";

const BASE_POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export function isOnBattery(): boolean {
  return powerMonitor.onBatteryPower;
}

export function getPollInterval(): number {
  return isOnBattery() ? BASE_POLL_INTERVAL_MS * 2 : BASE_POLL_INTERVAL_MS;
}

export function initPowerManagement(onChange: () => void): void {
  powerMonitor.on("on-battery", onChange);
  powerMonitor.on("on-ac", onChange);
}

export function cleanupPowerManagement(): void {
  powerMonitor.removeAllListeners("on-battery");
  powerMonitor.removeAllListeners("on-ac");
}

let blockerId: number | null = null;
let refCount = 0;

export function preventSleep(): void {
  refCount++;
  if (refCount === 1) {
    blockerId = powerSaveBlocker.start("prevent-display-sleep");
  }
}

export function allowSleep(): void {
  if (refCount <= 0) return;
  refCount--;
  if (refCount === 0 && blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
}

export function isSleepPrevented(): boolean {
  return blockerId !== null;
}

/** Reset sleep blocker state for tests — not for production use */
export function _resetSleepBlocker(): void {
  if (blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
  }
  blockerId = null;
  refCount = 0;
}
