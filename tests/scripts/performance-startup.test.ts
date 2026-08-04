import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  STARTUP_PHASES,
  EXECUTED_STARTUP_PHASES,
  NOT_EXERCISED_STARTUP_PHASES,
  syntheticPhaseDurations,
  evaluateRetained,
  parseStartupTrace,
} from "../../scripts/performance/measure-startup.mjs";

const script = join(process.cwd(), "scripts/performance/measure-startup.mjs");

describe("perf:startup", () => {
  it("declares executed vs not-exercised phase partitions", () => {
    expect(EXECUTED_STARTUP_PHASES).toEqual(
      expect.arrayContaining([
        "process-start",
        "electron-ready",
        "tray",
        "scheduler",
        "first-poll",
      ]),
    );
    expect(NOT_EXERCISED_STARTUP_PHASES).toEqual(
      expect.arrayContaining(["helper-spawn", "helper-query", "helper-parse", "updater"]),
    );
    expect(STARTUP_PHASES.length).toBe(
      EXECUTED_STARTUP_PHASES.length + NOT_EXERCISED_STARTUP_PHASES.length,
    );
  });

  it("synthetic durations exist for docs only and must not be native success", () => {
    const d = syntheticPhaseDurations();
    for (const phase of STARTUP_PHASES) {
      expect(typeof d[phase]).toBe("number");
    }
    // Native retention must not treat synthetic map as evidence of measurement.
    expect(evaluateRetained(d, 100, 0.5).ok).toBe(false);
  });

  it("retained evaluator requires phase share, absolute ms, and low CV", () => {
    expect(evaluateRetained({ a: 40 }, 100, 0.05).ok).toBe(false);
    expect(evaluateRetained({ a: 60 }, 100, 0.05).ok).toBe(true);
    expect(evaluateRetained({ a: 60 }, 100, 0.2).ok).toBe(false);
  });

  it("parseStartupTrace requires terminal and executed phases; rejects measured suppressed", () => {
    const bad = parseStartupTrace(`{"operation":"synthetic","outcome":"ok"}\n`);
    expect(bad.ok).toBe(false);

    const rows = [];
    for (const phase of EXECUTED_STARTUP_PHASES) {
      rows.push(
        JSON.stringify({
          version: 1,
          operation: "startup-phase",
          phase,
          outcome: "ok",
          startMs: 0,
          durationMs: 3,
        }),
      );
    }
    for (const phase of NOT_EXERCISED_STARTUP_PHASES) {
      rows.push(
        JSON.stringify({
          version: 1,
          operation: "startup-phase",
          phase,
          outcome: "not-exercised",
          startMs: 0,
          durationMs: 0,
        }),
      );
    }
    rows.push(
      JSON.stringify({
        version: 1,
        operation: "probe-terminal",
        outcome: "ok",
        startMs: 0,
        durationMs: 0,
        acceptedRows: 1,
        droppedRows: 0,
        acceptedBytes: 1,
        droppedBytes: 0,
      }),
    );
    const ok = parseStartupTrace(rows.join("\n"));
    expect(ok.ok).toBe(true);

    const measuredHelper = parseStartupTrace(
      [
        ...rows.slice(0, -1),
        JSON.stringify({
          version: 1,
          operation: "startup-phase",
          phase: "helper-spawn",
          outcome: "ok",
          startMs: 0,
          durationMs: 9,
        }),
        rows[rows.length - 1],
      ].join("\n"),
    );
    expect(measuredHelper.ok).toBe(false);
  });

  it("perf:startup exits 0 with blocked receipts when no packaged binary", () => {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: { ...process.env, GOGMEET_APP_PATH: "" },
    });
    expect(result.status).toBe(0);
    const receipts = JSON.parse(result.stdout);
    expect(Array.isArray(receipts)).toBe(true);
    expect(receipts.length).toBeGreaterThanOrEqual(2);
    for (const r of receipts) {
      expect(r.experiment).toBe("startup-lifecycle");
      expect(["blocked", "rejected", "retained"]).toContain(r.status);
      expect(r.productChange).toBe("none");
      expect(r.probeProfile).toBe("safe-lifecycle");
      if (r.status === "blocked") {
        expect(r.nativeExecuted).toBe(false);
      }
    }
  });
});
