import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createProbeUserDataDir,
  cleanupProbeUserDataDir,
  isValidProbeMode,
  launchPackagedProbe,
  PERF_PROBE_USER_DATA_PREFIX,
  PERF_TRACE_FILENAME,
} from "../../scripts/performance/helpers/packaged-probe.mjs";

describe("packaged-probe helper", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const r of roots) {
      try {
        cleanupProbeUserDataDir(r);
      } catch {
        try {
          rmSync(r, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }
    roots.length = 0;
  });

  it("validates finite modes", () => {
    expect(isValidProbeMode("startup")).toBe(true);
    expect(isValidProbeMode("evil")).toBe(false);
  });

  it("creates and cleans prefixed userData under tmpdir", () => {
    const dir = createProbeUserDataDir();
    roots.push(dir);
    expect(dir.includes(PERF_PROBE_USER_DATA_PREFIX)).toBe(true);
    expect(existsSync(dir)).toBe(true);
    cleanupProbeUserDataDir(dir);
    expect(existsSync(dir)).toBe(false);
    roots.length = 0;
  });

  it("refuses to delete non-probe paths", () => {
    const dir = join(tmpdir(), "not-a-probe-dir");
    mkdirSync(dir, { recursive: true });
    try {
      expect(() => cleanupProbeUserDataDir(dir)).toThrow(/Refusing/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks when electron path missing", async () => {
    const userDataDir = createProbeUserDataDir();
    roots.push(userDataDir);
    const outputDir = createProbeUserDataDir();
    roots.push(outputDir);
    const result = await launchPackagedProbe({
      electronPath: join(tmpdir(), "definitely-missing-electron-binary"),
      mode: "startup",
      userDataDir,
      outputDir,
      timeoutMs: 1_000,
    });
    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("native-runner-unavailable");
  });

  it("blocks invalid mode", async () => {
    const userDataDir = createProbeUserDataDir();
    roots.push(userDataDir);
    const outputDir = createProbeUserDataDir();
    roots.push(outputDir);
    writeFileSync(join(tmpdir(), "fake-bin-marker"), "x");
    const result = await launchPackagedProbe({
      electronPath: process.execPath, // exists but mode invalid
      mode: "not-a-mode",
      userDataDir,
      outputDir,
      timeoutMs: 500,
    });
    expect(result.status).toBe("blocked");
  });
});

describe("packaged-probe constants", () => {
  it("exports fixed trace filename", () => {
    expect(PERF_TRACE_FILENAME).toBe("gogmeet-perf-trace-v1.jsonl");
  });
});
