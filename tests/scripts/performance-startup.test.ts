import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  STARTUP_PHASES,
  syntheticPhaseDurations,
  evaluateRetained,
} from "../../scripts/performance/measure-startup.mjs";

const script = join(process.cwd(), "scripts/performance/measure-startup.mjs");

describe("perf:startup", () => {
  it("declares independent lifecycle phases including helper spawn/query/parse", () => {
    expect(STARTUP_PHASES).toEqual(
      expect.arrayContaining([
        "process-start",
        "electron-ready",
        "tray",
        "scheduler",
        "first-poll",
        "helper-spawn",
        "helper-query",
        "helper-parse",
      ]),
    );
  });

  it("synthetic durations cover every phase", () => {
    const d = syntheticPhaseDurations();
    for (const phase of STARTUP_PHASES) {
      expect(typeof d[phase]).toBe("number");
    }
  });

  it("retained evaluator requires phase share and absolute ms", () => {
    expect(evaluateRetained({ a: 40 }, 100).ok).toBe(false);
    expect(evaluateRetained({ a: 60 }, 100).ok).toBe(true);
  });

  it("perf:startup exits 0 with per-platform receipts", () => {
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const receipts = JSON.parse(result.stdout);
    expect(Array.isArray(receipts)).toBe(true);
    expect(receipts.length).toBeGreaterThanOrEqual(2);
    for (const r of receipts) {
      expect(r.task).toBe(13);
      expect(["blocked", "rejected", "retained", "skipped"]).toContain(r.status);
    }
  });
});
