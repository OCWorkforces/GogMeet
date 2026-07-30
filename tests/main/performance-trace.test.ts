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

  it("records error rows with allowlisted errorClass and powerMode", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    perfTrace({
      operation: "google-http",
      outcome: "error",
      errorClass: "timeout",
      startMs: 10,
      durationMs: 5,
      powerMode: "battery",
    });
    expect(getPerfTraceRecords()).toHaveLength(1);
    expect(getPerfTraceRecords()[0]).toMatchObject({
      outcome: "error",
      errorClass: "timeout",
      powerMode: "battery",
    });
  });

  it("drops rows with unknown operation, unknown errorClass, or negative metrics", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    perfTrace({
      operation: "not-a-real-op" as never,
      outcome: "ok",
      startMs: 1,
      durationMs: 1,
    });
    perfTrace({
      operation: "synthetic",
      outcome: "error",
      errorClass: "not-a-class" as never,
      startMs: 1,
      durationMs: 1,
    });
    perfTrace({
      operation: "synthetic",
      outcome: "ok",
      startMs: 1,
      durationMs: -1,
    });
    perfTrace({
      operation: "synthetic",
      outcome: "ok",
      startMs: 1,
      durationMs: 1,
      count: -1,
    });
    perfTrace({
      operation: "synthetic",
      outcome: "ok",
      startMs: 1,
      durationMs: 1,
      bytes: Number.NaN,
    });
    expect(getPerfTraceRecords()).toHaveLength(0);
  });

  it("rejects forbidden input keys without recording", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    perfTrace({
      operation: "synthetic",
      outcome: "ok",
      startMs: 1,
      durationMs: 1,
      // Runtime key scan should reject accidental secret-shaped bags.
      ...({ token: "x" } as object),
    } as never);
    expect(getPerfTraceRecords()).toHaveLength(0);
  });
});
