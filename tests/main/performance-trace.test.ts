import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  _resetPerfTraceForTests,
  buildProbeTerminalRecord,
  getPerfTraceDropStats,
  getPerfTraceRecords,
  isPerfTraceEnabled,
  MAX_PERF_TRACE_ROWS,
  MAX_PERF_TRACE_SERIALIZED_BYTES,
  PERF_TRACE_STARTUP_PHASES,
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
    expect(perfTraceToJsonl({ includeTerminal: false })).toBe("");
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
    expect(jsonl).toContain('"operation":"probe-terminal"');
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

  it("requires finite startup-phase enum and rejects unknown phases", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    perfTrace({
      operation: "startup-phase",
      phase: "tray",
      outcome: "ok",
      startMs: 1,
      durationMs: 2,
    });
    expect(getPerfTraceRecords()).toHaveLength(1);
    expect(getPerfTraceRecords()[0]?.phase).toBe("tray");

    perfTrace({
      operation: "startup-phase",
      phase: "not-a-phase" as never,
      outcome: "ok",
      startMs: 1,
      durationMs: 2,
    });
    expect(getPerfTraceRecords()).toHaveLength(1);
    expect(PERF_TRACE_STARTUP_PHASES).toContain("first-poll");
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

  it("enforces row cap with drop-new accounting and terminal reservation", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    for (let i = 0; i < MAX_PERF_TRACE_ROWS + 5; i++) {
      perfTrace({
        operation: "synthetic",
        outcome: "ok",
        startMs: i,
        durationMs: 1,
      });
    }
    expect(getPerfTraceRecords()).toHaveLength(MAX_PERF_TRACE_ROWS);
    const drops = getPerfTraceDropStats();
    expect(drops.droppedRows).toBe(5);
    expect(drops.acceptedRows).toBe(MAX_PERF_TRACE_ROWS);
    const terminal = buildProbeTerminalRecord();
    expect(terminal.operation).toBe("probe-terminal");
    expect(terminal.acceptedRows).toBe(MAX_PERF_TRACE_ROWS);
    expect(terminal.droppedRows).toBe(5);
    const jsonl = perfTraceToJsonl();
    const terminalLines = jsonl.split("\n").filter((l) => l.includes("probe-terminal"));
    expect(terminalLines).toHaveLength(1);
  });

  it("enforces serialized byte cap without exceeding MAX_PERF_TRACE_SERIALIZED_BYTES", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    // Large count/bytes fields inflate JSON size quickly.
    for (let i = 0; i < 50_000; i++) {
      perfTrace({
        operation: "synthetic",
        outcome: "ok",
        startMs: i,
        durationMs: 1,
        count: 1_000_000_000 + i,
        bytes: 1_000_000_000 + i,
      });
      if (getPerfTraceDropStats().droppedRows > 0) break;
    }
    const stats = getPerfTraceDropStats();
    expect(stats.droppedRows).toBeGreaterThan(0);
    expect(stats.acceptedBytes).toBeLessThanOrEqual(MAX_PERF_TRACE_SERIALIZED_BYTES);
    const jsonl = perfTraceToJsonl();
    expect(Buffer.byteLength(jsonl, "utf8")).toBeLessThanOrEqual(
      MAX_PERF_TRACE_SERIALIZED_BYTES + 4096,
    );
  });

  it("rejects caller-supplied probe-terminal into the data buffer", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    perfTrace({
      operation: "probe-terminal",
      outcome: "ok",
      startMs: 0,
      durationMs: 0,
      acceptedRows: 1,
      droppedRows: 0,
      acceptedBytes: 1,
      droppedBytes: 0,
    });
    expect(getPerfTraceRecords()).toHaveLength(0);
  });
});
