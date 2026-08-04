#!/usr/bin/env node
/**
 * Aggregate opt-in perf trace JSONL into p50/p95/min/max/sampleCount.
 * Usage: bun run perf:report -- --fixture synthetic
 *        bun run perf:report -- --stdin < traces.jsonl
 */
import { createInterface } from "node:readline";
import { stdin as input } from "node:process";

const OPERATIONS = new Set([
  "google-http",
  "swift-helper",
  "calendar-poll",
  "scheduler-plan",
  "tray-rebuild",
  "startup-phase",
  "probe-terminal",
  "alert-lifecycle",
  "safe-storage",
  "build-package",
  "synthetic",
]);

const STARTUP_PHASES = new Set([
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

const FORBIDDEN = /token|authorization|email|password|secret|title|description|meet\.google|pkce|verifier/i;

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function validateRow(row) {
  if (row === null || typeof row !== "object") return "not-object";
  if (row.version !== 1) return "bad-version";
  if (!OPERATIONS.has(row.operation)) return "unknown-operation";
  const outcomes = new Set(["ok", "error", "not-exercised", "dropped"]);
  if (!outcomes.has(row.outcome)) return "bad-outcome";
  if (!Number.isFinite(row.startMs) || !Number.isFinite(row.durationMs)) return "non-finite";
  if (row.durationMs < 0) return "negative-duration";
  if (row.operation === "startup-phase") {
    if (typeof row.phase !== "string" || !STARTUP_PHASES.has(row.phase)) {
      return "bad-startup-phase";
    }
  }
  if (row.operation === "probe-terminal") {
    for (const k of ["acceptedRows", "droppedRows", "acceptedBytes", "droppedBytes"]) {
      if (!Number.isFinite(row[k]) || row[k] < 0) return "bad-terminal-meta";
    }
  }
  const text = JSON.stringify(row);
  if (FORBIDDEN.test(text)) return "forbidden-value";
  for (const key of Object.keys(row)) {
    if (FORBIDDEN.test(key)) return "forbidden-key";
  }
  return null;
}

function summarize(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    sampleCount: sorted.length,
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
  };
}

function coefficientOfVariation(durations) {
  if (durations.length < 2) return null;
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  if (mean === 0) return null;
  const variance =
    durations.reduce((acc, d) => acc + (d - mean) ** 2, 0) / (durations.length - 1);
  return Math.sqrt(variance) / mean;
}

async function readRowsFromStdin() {
  const rows = [];
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.error("[perf:report] malformed JSONL line");
      process.exit(1);
    }
    const err = validateRow(parsed);
    if (err) {
      console.error(`[perf:report] invalid row: ${err}`);
      process.exit(1);
    }
    rows.push(parsed);
  }
  return rows;
}

function syntheticRows() {
  const now = Date.now();
  return Array.from({ length: 30 }, (_, i) => ({
    version: 1,
    operation: "synthetic",
    outcome: "ok",
    startMs: now + i,
    durationMs: 10 + (i % 7),
    platform: process.platform,
    arch: process.arch,
    powerMode: "unknown",
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const fixtureIdx = args.indexOf("--fixture");
  let rows;
  if (fixtureIdx >= 0 && args[fixtureIdx + 1] === "synthetic") {
    rows = syntheticRows();
  } else {
    rows = await readRowsFromStdin();
  }

  if (rows.length === 0) {
    console.error("[perf:report] no samples");
    process.exit(1);
  }

  // Non-monotonic start check
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].startMs < rows[i - 1].startMs) {
      console.error("[perf:report] non-monotonic startMs");
      process.exit(1);
    }
  }

  const byOp = new Map();
  for (const row of rows) {
    const list = byOp.get(row.operation) ?? [];
    list.push(row.durationMs);
    byOp.set(row.operation, list);
  }

  const report = {
    version: 1,
    operations: {},
  };
  for (const [op, durations] of byOp) {
    const stats = summarize(durations);
    const cv = coefficientOfVariation(durations);
    report.operations[op] = {
      ...stats,
      coefficientOfVariation: cv,
      varianceInvalid: cv !== null && cv >= 0.1,
    };
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((err) => {
  console.error("[perf:report]", err instanceof Error ? err.message : err);
  process.exit(1);
});
