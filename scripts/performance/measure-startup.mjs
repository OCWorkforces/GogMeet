#!/usr/bin/env node
/**
 * Packaged startup lifecycle measurement (safe probe profile).
 * Synthetic phase maps are never accepted as native success.
 *
 * Usage: bun run perf:startup -- --output-dir <dir>
 * Optional: GOGMEET_APP_PATH=/path/to/packaged/binary
 */
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  percentile,
  coefficientOfVariation,
  writeReceiptJson,
} from "./helpers/stats.mjs";
import {
  createProbeUserDataDir,
  cleanupProbeUserDataDir,
  launchPackagedProbe,
  PERF_TRACE_FILENAME,
} from "./helpers/packaged-probe.mjs";

/** Phases that must be measured (executed) in the safe packaged profile. */
export const EXECUTED_STARTUP_PHASES = Object.freeze([
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
  "first-poll",
]);

/** Finite not-exercised set for the safe profile (must not contribute to totals). */
export const NOT_EXERCISED_STARTUP_PHASES = Object.freeze([
  "updater",
  "helper-spawn",
  "helper-query",
  "helper-parse",
  "power-events",
  "global-shortcuts",
  "notification-permission",
  "auto-launch",
  "oauth",
  "shell-egress",
]);

/** Full phase vocabulary (executed ∪ not-exercised). */
export const STARTUP_PHASES = Object.freeze([
  ...EXECUTED_STARTUP_PHASES,
  ...NOT_EXERCISED_STARTUP_PHASES,
]);

/** @deprecated Synthetic maps must not drive native retention decisions. */
export function syntheticPhaseDurations() {
  const base = 8;
  return Object.fromEntries(STARTUP_PHASES.map((phase, i) => [phase, base + (i % 5) * 3]));
}

export function evaluateRetained(phaseMs, totalP95, totalCv) {
  if (typeof totalCv === "number" && totalCv >= 0.1) {
    return { ok: false, reason: "cv-too-high" };
  }
  for (const [phase, ms] of Object.entries(phaseMs)) {
    if (NOT_EXERCISED_STARTUP_PHASES.includes(phase)) continue;
    if (ms >= 50 && totalP95 > 0 && ms / totalP95 >= 0.1) {
      return { ok: true, phase, ms };
    }
  }
  return { ok: false, reason: "no-phase-meets-threshold" };
}

/**
 * Parse a probe JSONL into executed phase duration maps.
 * Rejects synthetic-only receipts for native classification.
 */
export function parseStartupTrace(jsonlText) {
  const lines = String(jsonlText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const phases = {};
  const notExercised = new Set();
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
    if (row.operation !== "startup-phase") continue;
    if (typeof row.phase !== "string") continue;
    if (row.outcome === "not-exercised") {
      notExercised.add(row.phase);
      continue;
    }
    if (row.outcome === "ok" && Number.isFinite(row.durationMs)) {
      phases[row.phase] = (phases[row.phase] ?? 0) + row.durationMs;
    }
  }
  if (!hasTerminal) return { ok: false, reason: "missing-terminal" };
  for (const p of EXECUTED_STARTUP_PHASES) {
    if (!(p in phases)) {
      return { ok: false, reason: `missing-executed-phase:${p}`, phases, notExercised: [...notExercised] };
    }
  }
  // Suppressed phases must not appear as measured ok rows in safe profile.
  for (const p of NOT_EXERCISED_STARTUP_PHASES) {
    if (p in phases) {
      return { ok: false, reason: `suppressed-phase-measured:${p}` };
    }
  }
  return { ok: true, phases, notExercised: [...notExercised] };
}

function hostArch() {
  return process.arch;
}

function parseArgs(argv) {
  let outputDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance-stability-hardening/task-7-startup",
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
  const host = hostArch();
  const samples = 10;

  const targets = [
    { platform: "darwin", arch: host },
    { platform: "win32", arch: host },
  ];

  const receipts = [];

  for (const target of targets) {
    const hostMatch = hostPlatform === target.platform;
    const archMatch = host === target.arch;
    const artifactArch = target.arch;
    const canRun =
      hostMatch &&
      archMatch &&
      typeof appPath === "string" &&
      appPath.length > 0 &&
      existsSync(appPath);

    if (!canRun) {
      receipts.push({
        experiment: "startup-lifecycle",
        status: "blocked",
        reason: "native-runner-unavailable",
        productChange: "none",
        probeProfile: "safe-lifecycle",
        hostPlatform,
        hostArch: host,
        artifactArch,
        nativeExecuted: false,
        // Synthetic maps may appear for documentation only — never nativeExecuted.
        syntheticReferenceOnly: syntheticPhaseDurations(),
      });
      continue;
    }

    const samplePhaseMaps = [];
    const totals = [];
    let failure = null;

    for (let i = 0; i < samples; i++) {
      const userDataDir = createProbeUserDataDir();
      try {
        const result = await launchPackagedProbe({
          electronPath: appPath,
          mode: "startup",
          userDataDir,
          outputDir: join(outputDir, `sample-${i}`),
          timeoutMs: 90_000,
        });
        if (result.status === "timeout" || result.status === "crash") {
          failure = result.status;
          break;
        }
        if (result.status === "blocked") {
          failure = "blocked";
          break;
        }
        if (!result.tracePath || !existsSync(result.tracePath)) {
          failure = "missing-trace";
          break;
        }
        const text = readFileSync(result.tracePath, "utf8");
        const parsed = parseStartupTrace(text);
        if (!parsed.ok) {
          failure = parsed.reason;
          break;
        }
        samplePhaseMaps.push(parsed.phases);
        const total = Object.entries(parsed.phases)
          .filter(([p]) => !NOT_EXERCISED_STARTUP_PHASES.includes(p))
          .reduce((a, [, v]) => a + v, 0);
        totals.push(total);
      } finally {
        cleanupProbeUserDataDir(userDataDir);
      }
    }

    if (failure) {
      receipts.push({
        experiment: "startup-lifecycle",
        status: failure === "blocked" ? "blocked" : "rejected",
        reason: failure,
        productChange: "none",
        probeProfile: "safe-lifecycle",
        hostPlatform,
        hostArch: host,
        artifactArch,
        nativeExecuted: failure !== "blocked",
      });
      continue;
    }

    const phaseAgg = {};
    for (const p of EXECUTED_STARTUP_PHASES) {
      const vals = samplePhaseMaps.map((m) => m[p] ?? 0);
      phaseAgg[p] = {
        p50: percentile(vals, 50),
        p95: percentile(vals, 95),
        cv: coefficientOfVariation(vals),
      };
    }
    const totalP50 = percentile(totals, 50);
    const totalP95 = percentile(totals, 95);
    const totalCv = coefficientOfVariation(totals);
    const phaseMsP95 = Object.fromEntries(
      Object.entries(phaseAgg).map(([k, v]) => [k, v.p95 ?? 0]),
    );
    const retained = evaluateRetained(phaseMsP95, totalP95 ?? 0, totalCv ?? 1);

    receipts.push({
      experiment: "startup-lifecycle",
      status: retained.ok ? "retained" : "rejected",
      reason: retained.ok ? retained.phase : retained.reason,
      productChange: "none",
      probeProfile: "safe-lifecycle",
      hostPlatform,
      hostArch: host,
      artifactArch,
      nativeExecuted: true,
      sampleCount: samples,
      total: { p50: totalP50, p95: totalP95, cv: totalCv },
      phases: phaseAgg,
      notExercised: [...NOT_EXERCISED_STARTUP_PHASES],
    });
  }

  // writeReceiptJson writes receipt.json under evidenceDir and prints JSON once.
  writeReceiptJson(outputDir, receipts);
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("measure-startup.mjs");

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
