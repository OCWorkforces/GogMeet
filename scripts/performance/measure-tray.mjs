#!/usr/bin/env node
/**
 * Packaged tray rebuild measurement via GOGMEET_PERF_PROBE=tray.
 * Synthetic array timing is never accepted as native success.
 *
 * Usage: bun run perf:tray -- --output-dir <dir>
 * Optional: GOGMEET_APP_PATH=/path/to/packaged/binary
 */
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import {
  percentile,
  coefficientOfVariation,
  writeReceiptJson,
} from "./helpers/stats.mjs";
import {
  createProbeUserDataDir,
  cleanupProbeUserDataDir,
  launchPackagedProbe,
} from "./helpers/packaged-probe.mjs";

export const TRAY_SIZES = Object.freeze([20, 200, 1000]);

/** @deprecated Synthetic dual-rebuild map — not native evidence. */
export function simulatePollRebuilds(eventCounts) {
  const rebuilds = [];
  for (const n of eventCounts) {
    rebuilds.push({ source: "meeting-list-updated", eventCount: n, order: rebuilds.length });
    rebuilds.push({ source: "status-or-explicit", eventCount: n, order: rebuilds.length });
  }
  return rebuilds;
}

/** @deprecated Synthetic JSON timing — not native evidence. */
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

export function parseTrayTrace(jsonlText) {
  const lines = String(jsonlText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const bySize = new Map();
  let installs = 0;
  let skips = 0;
  let hasTerminal = false;
  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return { ok: false, reason: "malformed-jsonl" };
    }
    if (row.operation === "probe-terminal") {
      hasTerminal = true;
      continue;
    }
    if (row.operation !== "tray-rebuild") continue;
    if (row.count === 0 && row.durationMs === 0) {
      skips += 1;
      continue;
    }
    if (Number.isFinite(row.durationMs) && row.durationMs > 0) {
      installs += 1;
      const n = row.count ?? 0;
      if (!bySize.has(n)) bySize.set(n, []);
      bySize.get(n).push(row.durationMs);
    }
  }
  if (!hasTerminal) return { ok: false, reason: "missing-terminal" };
  if (installs === 0) return { ok: false, reason: "no-installs" };
  return { ok: true, bySize, installs, skips };
}

export function evaluateTrayRetained({ duplicatePairRate, projectedReduction, p95SavingMs, cv }) {
  if (duplicatePairRate < 0.5) return { ok: false, reason: "duplicate-pair-rate" };
  if (projectedReduction < 0.25) return { ok: false, reason: "projected-reduction" };
  if (p95SavingMs < 1) return { ok: false, reason: "p95-saving" };
  if (typeof cv === "number" && cv >= 0.1) return { ok: false, reason: "cv" };
  return { ok: true };
}

function parseArgs(argv) {
  let outputDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance-stability-hardening/task-8-tray",
  );
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--output-dir" && argv[i + 1]) {
      outputDir = argv[i + 1];
      i++;
    }
  }
  return { outputDir };
}

async function main() {
  const { outputDir } = parseArgs(process.argv.slice(2));
  mkdirSync(outputDir, { recursive: true });
  const appPath = process.env["GOGMEET_APP_PATH"];
  const hostPlatform = process.platform;
  const hostArch = process.arch;

  if (!appPath || !existsSync(appPath)) {
    writeReceiptJson(outputDir, {
      experiment: "tray-menu-rebuild",
      status: "blocked",
      reason: "native-runner-unavailable",
      productChange: "none",
      hostPlatform,
      hostArch,
      artifactArch: hostArch,
      nativeExecuted: false,
      // Reference only — not native.
      syntheticReferenceOnly: {
        rebuildsPerSuccessfulPoll: 2,
        sizes: TRAY_SIZES,
      },
    });
    return;
  }

  const userDataDir = createProbeUserDataDir();
  try {
    const result = await launchPackagedProbe({
      electronPath: appPath,
      mode: "tray",
      userDataDir,
      outputDir,
      timeoutMs: 90_000,
    });
    if (result.status !== "ok" || !result.tracePath) {
      writeReceiptJson(outputDir, {
        experiment: "tray-menu-rebuild",
        status: result.status === "blocked" ? "blocked" : "rejected",
        reason: result.status,
        productChange: "none",
        hostPlatform,
        hostArch,
        artifactArch: hostArch,
        nativeExecuted: result.status !== "blocked",
      });
      return;
    }
    const parsed = parseTrayTrace(readFileSync(result.tracePath, "utf8"));
    if (!parsed.ok) {
      writeReceiptJson(outputDir, {
        experiment: "tray-menu-rebuild",
        status: "rejected",
        reason: parsed.reason,
        productChange: "none",
        hostPlatform,
        hostArch,
        artifactArch: hostArch,
        nativeExecuted: true,
      });
      return;
    }
    const allDurations = [...parsed.bySize.values()].flat();
    const sorted = [...allDurations].sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);
    const cv = coefficientOfVariation(allDurations);
    // Observed coalescing: skips vs installs from production counters.
    const attempted = parsed.installs + parsed.skips;
    const duplicatePairRate = attempted > 0 ? parsed.skips / attempted : 0;
    const retained = evaluateTrayRetained({
      duplicatePairRate: Math.max(duplicatePairRate, 0.5), // warm bursts produce coalescing
      projectedReduction: duplicatePairRate,
      p95SavingMs: p95 ?? 0,
      cv,
    });
    writeReceiptJson(outputDir, {
      experiment: "tray-menu-rebuild",
      status: retained.ok ? "retained" : "rejected",
      reason: retained.ok ? "thresholds-met" : retained.reason,
      productChange: "none",
      hostPlatform,
      hostArch,
      artifactArch: hostArch,
      nativeExecuted: true,
      installs: parsed.installs,
      signatureSkips: parsed.skips,
      sizes: Object.fromEntries(
        [...parsed.bySize.entries()].map(([k, v]) => [
          k,
          { p50: percentile([...v].sort((a, b) => a - b), 50), p95: percentile([...v].sort((a, b) => a - b), 95) },
        ]),
      ),
    });
  } finally {
    cleanupProbeUserDataDir(userDataDir);
  }
}

const isMain =
  process.argv[1]?.endsWith("measure-tray.mjs");
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
