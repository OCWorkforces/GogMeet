import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const reportScript = join(process.cwd(), "scripts/performance/report.mjs");
const fingerprintScript = join(process.cwd(), "scripts/performance/workspace-fingerprint.mjs");

describe("perf:report", () => {
  it("produces synthetic summary with p50/p95/min/max/sampleCount", () => {
    const result = spawnSync(process.execPath, [reportScript, "--fixture", "synthetic"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.version).toBe(1);
    expect(report.operations.synthetic.sampleCount).toBe(30);
    expect(typeof report.operations.synthetic.p50).toBe("number");
    expect(typeof report.operations.synthetic.p95).toBe("number");
    expect(typeof report.operations.synthetic.min).toBe("number");
    expect(typeof report.operations.synthetic.max).toBe("number");
  });

  it("exits nonzero on forbidden values in stdin JSONL", () => {
    const result = spawnSync(process.execPath, [reportScript], {
      encoding: "utf8",
      input: `${JSON.stringify({
        version: 1,
        operation: "synthetic",
        outcome: "ok",
        startMs: 1,
        durationMs: 1,
        token: "secret-should-not-appear",
      })}\n`,
    });
    expect(result.status).not.toBe(0);
  });

  it("exits nonzero on empty stdin", () => {
    const result = spawnSync(process.execPath, [reportScript], {
      encoding: "utf8",
      input: "",
    });
    expect(result.status).not.toBe(0);
  });
});

describe("perf:workspace-fingerprint", () => {
  it("prints HEAD and two sha256 digests", () => {
    const result = spawnSync(process.execPath, [fingerprintScript], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.HEAD).toMatch(/^[a-f0-9]{40}$/);
    expect(out.trackedDiffSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(out.untrackedManifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
