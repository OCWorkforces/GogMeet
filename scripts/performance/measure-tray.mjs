#!/usr/bin/env node
/**
 * Measure tray menu rebuild incidence/cost (measurement only).
 * Optional native timing: GOGMEET_ELECTRON_TRAY_BENCH=1 with Electron available.
 *
 * Usage: bun run perf:tray
 */
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { percentile, coefficientOfVariation, writeReceiptJson } from "./helpers/stats.mjs";

/** Simulate the two production rebuild sources per successful poll. */
export function simulatePollRebuilds(eventCounts) {
  const rebuilds = [];
  for (const n of eventCounts) {
    rebuilds.push({ source: "meeting-list-updated", eventCount: n, order: rebuilds.length });
    rebuilds.push({ source: "status-or-explicit", eventCount: n, order: rebuilds.length });
  }
  return rebuilds;
}

export function timeSyntheticBuild(eventCount, iterations = 30) {
  const durations = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const template = Array.from({ length: eventCount }, (_, j) => ({
      label: `Meeting ${j}`,
      enabled: true,
      type: "normal",
    }));
    void JSON.stringify(template);
    durations.push(performance.now() - start);
  }
  return durations;
}

/** Time Electron Menu.buildFromTemplate when electron is resolvable. */
export function timeElectronMenuBuild(eventCount, iterations = 30) {
  let Menu;
  try {
    const require = createRequire(import.meta.url);
    ({ Menu } = require("electron"));
  } catch {
    return null;
  }
  if (!Menu || typeof Menu.buildFromTemplate !== "function") return null;

  const durations = [];
  for (let i = 0; i < iterations; i++) {
    const template = Array.from({ length: eventCount }, (_, j) => ({
      label: `m-${j}`,
      enabled: true,
    }));
    const start = performance.now();
    Menu.buildFromTemplate(template);
    durations.push(performance.now() - start);
  }
  return durations;
}

function main() {
  const evidenceDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance/task-11-tray-measurement",
  );

  const rebuilds = simulatePollRebuilds([20, 200, 1000]);
  const perPoll = 2;
  const bursts = 10;
  const duplicatePairRate = 1;

  const sizes = [20, 200, 1000];
  const syntheticTimings = {};
  for (const n of sizes) {
    const d = timeSyntheticBuild(n, 30);
    const sorted = [...d].sort((a, b) => a - b);
    syntheticTimings[n] = {
      sampleCount: d.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      coefficientOfVariation: coefficientOfVariation(d),
    };
  }

  const electronRequested = process.env["GOGMEET_ELECTRON_TRAY_BENCH"] === "1";
  let nativeTimings = null;
  let status = "blocked";
  let reason = "packaged-native-tray-unavailable";

  if (electronRequested) {
    const native200 = timeElectronMenuBuild(200, 30);
    if (native200 === null) {
      status = "blocked";
      reason = "electron-module-unavailable";
    } else {
      nativeTimings = {};
      for (const n of sizes) {
        const d = timeElectronMenuBuild(n, 30) ?? [];
        const sorted = [...d].sort((a, b) => a - b);
        nativeTimings[n] = {
          sampleCount: d.length,
          p50: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          coefficientOfVariation: coefficientOfVariation(d),
        };
      }
      // Candidate: drop one of two rebuilds → 50% reduction of p95 cost of one build.
      const projectedReduction = 0.5;
      const p95Saved = nativeTimings[200]?.p95 ?? 0;
      const coef = nativeTimings[200]?.coefficientOfVariation;
      if (
        duplicatePairRate >= 0.5 &&
        projectedReduction >= 0.25 &&
        p95Saved >= 1 &&
        coef !== null &&
        coef < 0.1
      ) {
        status = "retained";
        reason = "thresholds-met-follow-up-plan-only";
      } else {
        status = "rejected";
        reason = "below-threshold-or-high-variance";
      }
    }
  }

  const receipt = {
    version: 1,
    experiment: "tray-menu-rebuild",
    status,
    reason,
    platform: process.platform,
    arch: process.arch,
    rebuildsPerSuccessfulPoll: perPoll,
    rebuildOrdering: rebuilds.slice(0, 4).map((r) => r.source),
    duplicatePairRate,
    syntheticTimingsMs: syntheticTimings,
    nativeTimingsMs: nativeTimings,
    retainedCriteria: {
      minDuplicatePairRate: 0.5,
      minProjectedReduction: 0.25,
      minP95SavedMsPerPoll: 1,
      maxCoefficientOfVariation: 0.1,
    },
    productChange: "none",
  };

  writeReceiptJson(evidenceDir, receipt);
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("measure-tray.mjs") || process.argv[1].includes("measure-tray"));
if (isMain) main();
