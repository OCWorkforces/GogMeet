#!/usr/bin/env node
/**
 * Measure tray menu rebuild incidence/cost (measurement only).
 * Usage: bun run perf:tray
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

/** Simulate the two production rebuild sources per successful poll. */
export function simulatePollRebuilds(eventCounts) {
  const rebuilds = [];
  for (const n of eventCounts) {
    // Source A: meeting-list-updated bus → tray cache + rebuild
    // Source B: calendar-status-updated / explicit refreshContextMenu
    rebuilds.push({ source: "meeting-list-updated", eventCount: n, order: rebuilds.length });
    rebuilds.push({ source: "status-or-explicit", eventCount: n, order: rebuilds.length });
  }
  return rebuilds;
}

export function timeSyntheticBuild(eventCount, iterations = 30) {
  const durations = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    // Approximate template materialization cost without Electron Menu.
    const template = Array.from({ length: eventCount }, (_, j) => ({
      label: `Meeting ${j}`,
      enabled: true,
      type: "normal",
    }));
    // Force materialization
    void JSON.stringify(template);
    durations.push(performance.now() - start);
  }
  return durations;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function cv(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((acc, d) => acc + (d - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
}

function main() {
  const evidenceDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance/task-11-tray-measurement",
  );
  mkdirSync(evidenceDir, { recursive: true });

  const rebuilds = simulatePollRebuilds([20, 200, 1000]);
  const perPoll = 2;
  const bursts = 10;
  const duplicatePairs = bursts; // every poll produces a duplicate pair
  const duplicatePairRate = duplicatePairs / bursts;

  const sizes = [20, 200, 1000];
  const timings = {};
  for (const n of sizes) {
    const d = timeSyntheticBuild(n, 30);
    const sorted = [...d].sort((a, b) => a - b);
    timings[n] = {
      sampleCount: d.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      coefficientOfVariation: cv(d),
    };
  }

  // Native Menu.buildFromTemplate / setContextMenu unavailable outside Electron.
  const packagedTrayAvailable = false;
  let status = "blocked";
  let reason = "packaged-native-tray-unavailable";

  // Even with synthetic timings, retained requires native tray + thresholds.
  if (packagedTrayAvailable) {
    const projectedReduction = 0.5; // drop one of two rebuilds
    const p95Saved = timings[200].p95; // hypothetical full save of one rebuild
    const coef = timings[200].coefficientOfVariation;
    if (
      duplicatePairRate >= 0.5 &&
      projectedReduction >= 0.25 &&
      p95Saved >= 1 &&
      coef !== null &&
      coef < 0.1
    ) {
      status = "retained";
      reason = "thresholds-met";
    } else {
      status = "rejected";
      reason = "below-threshold-or-high-variance";
    }
  }

  const receipt = {
    version: 1,
    task: 11,
    status,
    reason,
    platform: process.platform,
    arch: process.arch,
    rebuildsPerSuccessfulPoll: perPoll,
    rebuildOrdering: rebuilds.slice(0, 4).map((r) => r.source),
    duplicatePairRate,
    syntheticTimingsMs: timings,
    retainedCriteria: {
      minDuplicatePairRate: 0.5,
      minProjectedReduction: 0.25,
      minP95SavedMsPerPoll: 1,
      maxCoefficientOfVariation: 0.1,
    },
  };

  writeFileSync(join(evidenceDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("measure-tray.mjs") || process.argv[1].includes("measure-tray"));
if (isMain) main();
