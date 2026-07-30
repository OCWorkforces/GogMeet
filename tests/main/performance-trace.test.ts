import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  _resetPerfTraceForTests,
  getPerfTraceRecords,
  isPerfTraceEnabled,
  perfTrace,
  perfTraceToJsonl,
} from "../../src/main/utils/performance-trace.js";

describe("performance-trace", () => {
  const prev = process.env["GOGMEET_PERF_TRACE"];

  beforeEach(() => {
    delete process.env["GOGMEET_PERF_TRACE"];
    _resetPerfTraceForTests();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env["GOGMEET_PERF_TRACE"];
    else process.env["GOGMEET_PERF_TRACE"] = prev;
    _resetPerfTraceForTests();
  });

  it("records nothing when GOGMEET_PERF_TRACE is unset", () => {
    expect(isPerfTraceEnabled()).toBe(false);
    perfTrace({
      operation: "synthetic",
      outcome: "ok",
      startMs: 1,
      durationMs: 2,
    });
    expect(getPerfTraceRecords()).toHaveLength(0);
    expect(perfTraceToJsonl()).toBe("");
  });

  it("records allowlisted rows when enabled", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    expect(isPerfTraceEnabled()).toBe(true);
    perfTrace({
      operation: "synthetic",
      outcome: "ok",
      startMs: 100,
      durationMs: 12,
      count: 1,
      bytes: 64,
    });
    const rows = getPerfTraceRecords();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      version: 1,
      operation: "synthetic",
      outcome: "ok",
      startMs: 100,
      durationMs: 12,
      count: 1,
      bytes: 64,
    });
    const jsonl = perfTraceToJsonl();
    expect(jsonl).toContain('"operation":"synthetic"');
    expect(jsonl).not.toMatch(/token|authorization|email/i);
  });

  it("rejects non-finite durations", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    perfTrace({
      operation: "synthetic",
      outcome: "ok",
      startMs: 1,
      durationMs: Number.NaN,
    });
    expect(getPerfTraceRecords()).toHaveLength(0);
  });
});
