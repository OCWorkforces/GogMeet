import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  syntheticAlertPayload,
  timeVariant,
  parseAlertTrace,
  evaluateAlertRetained,
} from "../../scripts/performance/measure-alert.mjs";

const script = join(process.cwd(), "scripts/performance/measure-alert.mjs");

describe("perf:alert", () => {
  it("synthetic helpers remain for reference only", () => {
    expect(syntheticAlertPayload(1).marker).toContain("syn-");
    expect(timeVariant("hide-reuse", 3)).toHaveLength(3);
  });

  it("parseAlertTrace splits hide-reuse vs destroy-between markers", () => {
    const jsonl = [
      JSON.stringify({
        version: 1,
        operation: "alert-lifecycle",
        outcome: "ok",
        startMs: 0,
        durationMs: 10,
        count: 1,
      }),
      JSON.stringify({
        version: 1,
        operation: "alert-lifecycle",
        outcome: "ok",
        startMs: 0,
        durationMs: 40,
        count: 2,
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
    const parsed = parseAlertTrace(jsonl);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.reuse).toEqual([10]);
      expect(parsed.destroyBetween).toEqual([40]);
    }
  });

  it("retained requires meaningful p50 improvement", () => {
    expect(
      evaluateAlertRetained(
        { p50: 10, p95: 12, cv: 0.05, sampleCount: 30 },
        { p50: 50, p95: 60, cv: 0.05, sampleCount: 30 },
      ).ok,
    ).toBe(true);
    expect(
      evaluateAlertRetained(
        { p50: 40, p95: 45, cv: 0.05, sampleCount: 30 },
        { p50: 50, p95: 60, cv: 0.05, sampleCount: 30 },
      ).ok,
    ).toBe(false);
  });

  it("perf:alert exits 0 with blocked receipt without packaged binary", () => {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: { ...process.env, GOGMEET_APP_PATH: "" },
    });
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.experiment).toBe("alert-lifecycle");
    expect(receipt.status).toBe("blocked");
    expect(receipt.productChange).toBe("none");
  });
});
