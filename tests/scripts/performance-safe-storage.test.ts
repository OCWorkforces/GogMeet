import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  classifyStorageFailure,
  assertNeverUnlinksOnTemporary,
  parseSafeStorageTrace,
  evaluateSafeStorageRetained,
} from "../../scripts/performance/measure-safe-storage.mjs";

const script = join(process.cwd(), "scripts/performance/measure-safe-storage.mjs");

describe("perf:safe-storage", () => {
  it("temporary unavailability never unlinks ciphertext", () => {
    const r = classifyStorageFailure({
      fileExists: true,
      encryptionAvailable: false,
      decryptThrows: false,
      payloadValid: true,
    });
    expect(assertNeverUnlinksOnTemporary(r)).toBe(true);
    expect(r.preservedCiphertext).toBe(true);
  });

  it("parseSafeStorageTrace requires 10 cycles and terminal", () => {
    const rows = [];
    for (let i = 0; i < 10; i++) {
      rows.push(
        JSON.stringify({
          version: 1,
          operation: "safe-storage",
          outcome: "ok",
          startMs: i,
          durationMs: 12 + i,
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
        acceptedRows: 10,
        droppedRows: 0,
        acceptedBytes: 1,
        droppedBytes: 0,
      }),
    );
    const parsed = parseSafeStorageTrace(rows.join("\n"));
    expect(parsed.ok).toBe(true);
  });

  it("retained thresholds match plan", () => {
    const durations = Array.from({ length: 10 }, () => 15);
    expect(evaluateSafeStorageRetained(durations).ok).toBe(true);
    expect(evaluateSafeStorageRetained(Array.from({ length: 10 }, () => 1)).ok).toBe(false);
  });

  it("perf:safe-storage exits 0 with blocked on non-Windows or missing binary", () => {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: { ...process.env, GOGMEET_APP_PATH: "" },
    });
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.experiment).toBe("safe-storage");
    expect(["blocked", "rejected"]).toContain(receipt.status);
    expect(receipt.productChange).toBe("none");
  });
});
