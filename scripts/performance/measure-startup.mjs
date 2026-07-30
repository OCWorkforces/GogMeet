#!/usr/bin/env node
/**
 * Baseline packaged startup / helper phases (measurement only).
 * Optional: GOGMEET_APP_PATH=/path/to/GogMeet.app/Contents/MacOS/GogMeet for cold-launch samples.
 *
 * Usage: bun run perf:startup
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { percentile, coefficientOfVariation, writeReceiptJson } from "./lib/stats.mjs";

export const STARTUP_PHASES = Object.freeze([
  "process-start",
  "electron-ready",
  "window-create-load",
  "app-graph",
  "warmup-dispatch",
  "ipc-register",
  "settings-permission",
  "tray",
  "scheduler",
  "watcher",
  "updater",
  "first-poll",
  "helper-spawn",
  "helper-query",
  "helper-parse",
]);

export function syntheticPhaseDurations() {
  const base = 8;
  return Object.fromEntries(STARTUP_PHASES.map((phase, i) => [phase, base + (i % 5) * 3]));
}

export function evaluateRetained(phaseMs, totalP95) {
  for (const [phase, ms] of Object.entries(phaseMs)) {
    if (ms >= 50 && ms / totalP95 >= 0.1) {
      return { ok: true, phase, ms };
    }
  }
  return { ok: false };
}

/** Cold-launch wall times for a packaged binary (ms). */
export async function sampleColdLaunches(appPath, samples = 5, settleMs = 2500) {
  if (!appPath || !existsSync(appPath)) return null;
  const durations = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    const child = spawn(appPath, [], {
      stdio: "ignore",
      detached: true,
      env: { ...process.env, GOGMEET_PERF_TRACE: "0" },
    });
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    durations.push(performance.now() - start);
  }
  return durations;
}

async function main() {
  const evidenceDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance/task-13-startup-measurement",
  );

  const appPath = process.env["GOGMEET_APP_PATH"];
  const platforms = [
    { platform: "darwin", arch: process.arch },
    { platform: "win32", arch: process.arch },
  ];

  let coldLaunches = null;
  if (appPath) {
    try {
      coldLaunches = await sampleColdLaunches(appPath, 5, 2000);
    } catch {
      coldLaunches = null;
    }
  }

  const receipts = [];
  for (const target of platforms) {
    const hostMatch = process.platform === target.platform;
    let status = "blocked";
    let reason = "packaged-cold-warm-launch-unavailable";
    const phases = syntheticPhaseDurations();
    const total = Object.values(phases).reduce((a, b) => a + b, 0);

    if (hostMatch && coldLaunches && coldLaunches.length >= 3) {
      const summary = {
        sampleCount: coldLaunches.length,
        p50: percentile([...coldLaunches].sort((a, b) => a - b), 50),
        p95: percentile([...coldLaunches].sort((a, b) => a - b), 95),
        coefficientOfVariation: coefficientOfVariation(coldLaunches),
      };
      const evald = evaluateRetained(phases, total);
      // Without per-phase instrumentation from a real trace, product retain is not claimed.
      if (summary.coefficientOfVariation !== null && summary.coefficientOfVariation >= 0.1) {
        status = "rejected";
        reason = "variance-invalid";
      } else if (evald.ok) {
        status = "rejected";
        reason = "cold-launch-sampled-phase-instrumentation-required";
      } else {
        status = "rejected";
        reason = "no-phase-meets-threshold";
      }
      receipts.push({
        version: 1,
        experiment: "startup-lifecycle",
        status,
        reason,
        platform: target.platform,
        arch: target.arch,
        phases,
        totalMsSynthetic: total,
        coldLaunchMs: summary,
        retainedCriteria: {
          minPhaseShareOfP95Total: 0.1,
          minPhaseMs: 50,
          maxCoefficientOfVariation: 0.1,
        },
        productChange: "none",
      });
      continue;
    }

    if (!hostMatch) {
      status = "blocked";
      reason = "not-running-on-target-platform";
    }

    receipts.push({
      version: 1,
      experiment: "startup-lifecycle",
      status,
      reason,
      platform: target.platform,
      arch: target.arch,
      phases,
      totalMsSynthetic: total,
      retainedCriteria: {
        minPhaseShareOfP95Total: 0.1,
        minPhaseMs: 50,
        maxCoefficientOfVariation: 0.1,
      },
      productChange: "none",
    });
  }

  writeReceiptJson(evidenceDir, receipts);
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("measure-startup.mjs") || process.argv[1].includes("measure-startup"));
if (isMain) {
  main().catch(() => {
    process.stderr.write("[perf:startup] fatal (redacted)\n");
    process.exit(1);
  });
}
