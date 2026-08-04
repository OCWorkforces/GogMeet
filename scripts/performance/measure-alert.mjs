#!/usr/bin/env node
/**
 * Packaged alert lifecycle measurement via GOGMEET_PERF_PROBE=alert.
 *
 * Usage: bun run perf:alert -- --output-dir <dir>
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

export function syntheticAlertPayload(seed) {
  return {
    marker: `syn-${seed}`,
    hasJoin: seed % 2 === 0,
    screenW: 1440,
    screenH: 900,
  };
}

/** @deprecated Array work is never native evidence. */
export function timeVariant(variant, cycles) {
  const durations = [];
  for (let i = 0; i < cycles; i++) {
    const payload = syntheticAlertPayload(i);
    const start = performance.now();
    void JSON.stringify(payload);
    const n = variant === "destroy-recreate" ? 200 : 40;
    const work = new Array(n).fill(0).map((_, j) => j * (i + 1));
    void work.reduce((a, b) => a + b, 0);
    durations.push(performance.now() - start);
  }
  return durations;
}

export function parseAlertTrace(jsonlText) {
  const lines = String(jsonlText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const reuse = [];
  const destroyBetween = [];
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
    if (row.operation !== "alert-lifecycle") continue;
    if (!Number.isFinite(row.durationMs)) continue;
    if (row.count === 2) destroyBetween.push(row.durationMs);
    else reuse.push(row.durationMs);
  }
  if (!hasTerminal) return { ok: false, reason: "missing-terminal" };
  if (reuse.length === 0 && destroyBetween.length === 0) {
    return { ok: false, reason: "no-alert-rows" };
  }
  return { ok: true, reuse, destroyBetween };
}

export function evaluateAlertRetained(reuseStats, destroyStats) {
  if (!reuseStats || !destroyStats) return { ok: false, reason: "missing-stats" };
  const p50Improve =
    destroyStats.p50 > 0 ? (destroyStats.p50 - reuseStats.p50) / destroyStats.p50 : 0;
  const p50Abs = destroyStats.p50 - reuseStats.p50;
  if (p50Improve < 0.2 || p50Abs < 25) return { ok: false, reason: "p50-improvement" };
  if (reuseStats.cv != null && reuseStats.cv >= 0.1) return { ok: false, reason: "cv" };
  return { ok: true };
}

function stats(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    sampleCount: durations.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    cv: coefficientOfVariation(durations),
  };
}

function parseArgs(argv) {
  let outputDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance-stability-hardening/task-9-alert",
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
      experiment: "alert-lifecycle",
      status: "blocked",
      reason: "native-runner-unavailable",
      productChange: "none",
      hostPlatform,
      hostArch,
      artifactArch: hostArch,
      nativeExecuted: false,
    });
    return;
  }

  const userDataDir = createProbeUserDataDir();
  try {
    const result = await launchPackagedProbe({
      electronPath: appPath,
      mode: "alert",
      userDataDir,
      outputDir,
      timeoutMs: 120_000,
    });
    if (result.status !== "ok" || !result.tracePath) {
      writeReceiptJson(outputDir, {
        experiment: "alert-lifecycle",
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
    const parsed = parseAlertTrace(readFileSync(result.tracePath, "utf8"));
    if (!parsed.ok) {
      writeReceiptJson(outputDir, {
        experiment: "alert-lifecycle",
        status: "rejected",
        reason: parsed.reason,
        productChange: "none",
        nativeExecuted: true,
        hostPlatform,
        hostArch,
        artifactArch: hostArch,
      });
      return;
    }
    const reuseStats = stats(parsed.reuse);
    const destroyStats = stats(parsed.destroyBetween);
    const retained = evaluateAlertRetained(reuseStats, destroyStats);
    writeReceiptJson(outputDir, {
      experiment: "alert-lifecycle",
      status: retained.ok ? "retained" : "rejected",
      reason: retained.ok ? "thresholds-met" : retained.reason,
      productChange: "none",
      hostPlatform,
      hostArch,
      artifactArch: hostArch,
      nativeExecuted: true,
      hideReuse: reuseStats,
      destroyBetween: destroyStats,
    });
  } finally {
    cleanupProbeUserDataDir(userDataDir);
  }
}

if (process.argv[1]?.endsWith("measure-alert.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
