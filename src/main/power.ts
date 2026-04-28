import { powerMonitor, powerSaveBlocker } from "electron";

import { mainBus } from "./events.js";

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

/**
 * Register power-state event publishers on the main event bus.
 *
 * Separate from {@link initPowerManagement} so the existing `onChange`
 * registration semantics (and tests) remain unchanged. Call once at
 * lifecycle init alongside `initPowerManagement`.
 */
export function initPowerEvents(): void {
  powerMonitor.on("on-battery", () => {
    mainBus.emit("power-state-changed", { onAC: false });
  });
  powerMonitor.on("on-ac", () => {
    mainBus.emit("power-state-changed", { onAC: true });
  });
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
    try {
      blockerId = powerSaveBlocker.start("prevent-display-sleep");
    } catch (err) {
      console.error("[power] preventSleep error:", err);
      refCount--;
      blockerId = null;
    }
  }
}

export function allowSleep(): void {
  if (refCount <= 0) return;
  refCount--;
  if (refCount === 0 && blockerId !== null) {
    try {
      powerSaveBlocker.stop(blockerId);
    } catch (err) {
      console.error("[power] allowSleep error:", err);
    }
    blockerId = null;
  }
}

export function isSleepPrevented(): boolean {
  return blockerId !== null;
}

/** Reset sleep blocker state for tests — not for production use */
export function _resetSleepBlocker(): void {
  if (blockerId !== null) {
    try {
      powerSaveBlocker.stop(blockerId);
    } catch (err) {
      console.error("[power] _resetSleepBlocker error:", err);
    }
  }
  blockerId = null;
  refCount = 0;
}
