import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  simulatePollRebuilds,
  timeSyntheticBuild,
  parseTrayTrace,
  evaluateTrayRetained,
  TRAY_SIZES,
} from "../../scripts/performance/measure-tray.mjs";

const script = join(process.cwd(), "scripts/performance/measure-tray.mjs");

describe("perf:tray", () => {
  it("keeps synthetic dual-rebuild helper for reference only", () => {
    const rebuilds = simulatePollRebuilds([20]);
    expect(rebuilds).toHaveLength(2);
    expect(TRAY_SIZES).toEqual([20, 200, 1000]);
  });

  it("synthetic build helper remains deterministic for docs", () => {
    for (const n of [20, 200, 1000]) {
      const d = timeSyntheticBuild(n, 5);
      expect(d).toHaveLength(5);
    }
  });

  it("parseTrayTrace requires terminal and install rows", () => {
    expect(parseTrayTrace("").ok).toBe(false);
    const jsonl = [
      JSON.stringify({
        version: 1,
        operation: "tray-rebuild",
        outcome: "ok",
        startMs: 1,
        durationMs: 2,
        count: 20,
      }),
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
    ].join("\n");
    const parsed = parseTrayTrace(jsonl);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.installs).toBe(1);
  });

  it("retained evaluator enforces plan thresholds", () => {
    expect(
      evaluateTrayRetained({
        duplicatePairRate: 0.6,
        projectedReduction: 0.3,
        p95SavingMs: 2,
        cv: 0.05,
      }).ok,
    ).toBe(true);
    expect(
      evaluateTrayRetained({
        duplicatePairRate: 0.1,
        projectedReduction: 0.3,
        p95SavingMs: 2,
        cv: 0.05,
      }).ok,
    ).toBe(false);
  });

  it("perf:tray exits 0 with blocked receipt without packaged binary", () => {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: { ...process.env, GOGMEET_APP_PATH: "" },
    });
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.experiment).toBe("tray-menu-rebuild");
    expect(receipt.status).toBe("blocked");
    expect(receipt.productChange).toBe("none");
    expect(receipt.nativeExecuted).toBe(false);
  });
});
