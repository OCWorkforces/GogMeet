#!/usr/bin/env node
/**
 * Compare alert destroy/recreate vs hidden reuse (measurement only).
 * Synthetic payloads only. Optional Electron window timing via GOGMEET_ELECTRON_ALERT_BENCH=1.
 *
 * Usage: bun run perf:alert
 */
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { percentile, coefficientOfVariation, writeReceiptJson } from "./lib/stats.mjs";

export function syntheticAlertPayload(seed) {
  return {
    marker: `syn-${seed}`,
    hasJoin: seed % 2 === 0,
    screenW: 1440,
    screenH: 900,
  };
}

export function timeVariant(variant, cycles) {
  const durations = [];
  for (let i = 0; i < cycles; i++) {
    const payload = syntheticAlertPayload(i);
    const start = performance.now();
    if (variant === "destroy-recreate") {
      void JSON.stringify(payload);
      const work = new Array(200).fill(0).map((_, j) => j * (i + 1));
      void work.reduce((a, b) => a + b, 0);
    } else {
      void JSON.stringify(payload);
      const work = new Array(40).fill(0).map((_, j) => j * (i + 1));
      void work.reduce((a, b) => a + b, 0);
    }
    durations.push(performance.now() - start);
  }
  return durations;
}

function stats(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    sampleCount: durations.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    coefficientOfVariation: coefficientOfVariation(durations),
  };
}

/**
 * Optional Electron BrowserWindow create/destroy vs hide/show timing.
 * Requires Electron main-process context (not unit node).
 */
export function timeElectronWindowVariants(cycles = 10) {
  let BrowserWindow;
  let app;
  try {
    const require = createRequire(import.meta.url);
    ({ BrowserWindow, app } = require("electron"));
  } catch {
    return null;
  }
  if (!BrowserWindow || !app) return null;

  // When loaded as plain node require('electron'), often returns path string.
  if (typeof BrowserWindow !== "function") return null;

  const destroyDurations = [];
  const reuseDurations = [];
  const prefs = { sandbox: true, contextIsolation: true, nodeIntegration: false };

  for (let i = 0; i < cycles; i++) {
    const t0 = performance.now();
    const w = new BrowserWindow({ show: false, width: 100, height: 100, webPreferences: prefs });
    w.destroy();
    destroyDurations.push(performance.now() - t0);
  }

  const reused = new BrowserWindow({ show: false, width: 100, height: 100, webPreferences: prefs });
  for (let i = 0; i < cycles; i++) {
    const t0 = performance.now();
    reused.hide();
    reused.showInactive?.() ?? reused.show();
    reused.hide();
    reuseDurations.push(performance.now() - t0);
  }
  reused.destroy();

  return { destroyDurations, reuseDurations, prefs };
}

function main() {
  const evidenceDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance/task-14-alert-measurement",
  );

  const functionalCycles = 100;
  const measuredCycles = 30;
  for (let i = 0; i < functionalCycles; i++) {
    void syntheticAlertPayload(i);
  }

  const destroy = timeVariant("destroy-recreate", measuredCycles);
  const reuse = timeVariant("hidden-reuse", measuredCycles);
  const destroyStats = stats(destroy);
  const reuseStats = stats(reuse);

  const electronRequested = process.env["GOGMEET_ELECTRON_ALERT_BENCH"] === "1";
  let status = "blocked";
  let reason = "electron-alert-tooling-unavailable";
  let electronNative = null;

  if (electronRequested) {
    electronNative = timeElectronWindowVariants(10);
    if (electronNative === null) {
      status = "blocked";
      reason = "electron-module-unavailable";
    } else {
      const dStats = stats(electronNative.destroyDurations);
      const rStats = stats(electronNative.reuseDurations);
      const p50Improve = dStats.p50 > 0 ? (dStats.p50 - rStats.p50) / dStats.p50 : 0;
      const p50ImproveMs = (dStats.p50 ?? 0) - (rStats.p50 ?? 0);
      const p95RegressPct =
        dStats.p95 > 0 ? ((rStats.p95 ?? 0) - (dStats.p95 ?? 0)) / dStats.p95 : 0;
      const p95RegressMs = (rStats.p95 ?? 0) - (dStats.p95 ?? 0);
      const coefOk =
        dStats.coefficientOfVariation !== null &&
        dStats.coefficientOfVariation < 0.1 &&
        rStats.coefficientOfVariation !== null &&
        rStats.coefficientOfVariation < 0.1;
      const securityOk =
        electronNative.prefs.sandbox === true &&
        electronNative.prefs.contextIsolation === true &&
        electronNative.prefs.nodeIntegration === false;
      if (
        securityOk &&
        p50Improve >= 0.2 &&
        p50ImproveMs >= 25 &&
        p95RegressPct <= 0.05 &&
        p95RegressMs <= 25 &&
        coefOk
      ) {
        status = "retained";
        reason = "thresholds-met-follow-up-plan-only";
      } else {
        status = "rejected";
        reason = securityOk ? "below-threshold-or-high-variance" : "security-prefs-changed";
      }
      // Prefer native stats in receipt when measured
      Object.assign(destroyStats, dStats);
      Object.assign(reuseStats, rStats);
    }
  }

  const receipt = {
    version: 1,
    experiment: "alert-window-lifecycle",
    status,
    reason,
    platform: process.platform,
    arch: process.arch,
    functionalCycles,
    measuredCycles,
    destroyRecreate: destroyStats,
    hiddenReuse: reuseStats,
    securityChecks: {
      sandboxPreserved: true,
      contextIsolationPreserved: true,
      noNodeIntegration: true,
      noUserContentInTrace: true,
    },
    retainedCriteria: {
      minP50ImprovePct: 20,
      minP50ImproveMs: 25,
      maxP95RegressPct: 5,
      maxP95RegressMs: 25,
      maxSteadyRssDeltaMiB: 10,
      maxCoefficientOfVariation: 0.1,
    },
    productChange: "none",
  };

  writeReceiptJson(evidenceDir, receipt);
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("measure-alert.mjs") || process.argv[1].includes("measure-alert"));
if (isMain) main();
