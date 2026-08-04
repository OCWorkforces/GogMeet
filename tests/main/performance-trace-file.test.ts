import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { _resetPerfTraceForTests, perfTrace } from "../../src/main/utils/performance-trace.js";
import {
  _resetPerfTraceFileForTests,
  flushPerfTraceToUserData,
  getPerfTraceFilePath,
  PERF_TRACE_FILENAME,
  registerPerfTraceBeforeQuitFlush,
} from "../../src/main/utils/performance-trace-file.js";

describe("performance-trace-file", () => {
  const prev = process.env["GOGMEET_PERF_TRACE"];
  let userData: string;

  beforeEach(() => {
    delete process.env["GOGMEET_PERF_TRACE"];
    _resetPerfTraceForTests();
    _resetPerfTraceFileForTests();
    userData = mkdtempSync(join(tmpdir(), "gogmeet-perf-probe-"));
  });

  afterEach(() => {
    if (prev === undefined) delete process.env["GOGMEET_PERF_TRACE"];
    else process.env["GOGMEET_PERF_TRACE"] = prev;
    _resetPerfTraceForTests();
    _resetPerfTraceFileForTests();
    try {
      rmSync(userData, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("disabled tracing creates no file", () => {
    const result = flushPerfTraceToUserData(userData);
    expect(result.ok).toBe(true);
    expect(result.path).toBeNull();
    expect(existsSync(join(userData, PERF_TRACE_FILENAME))).toBe(false);
  });

  it("publishes fixed path under userData with terminal row via temp+rename", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    _resetPerfTraceFileForTests();
    for (let i = 0; i < 5; i++) {
      perfTrace({
        operation: "startup-phase",
        phase: "tray",
        outcome: "ok",
        startMs: i,
        durationMs: 1,
      });
    }
    const path = getPerfTraceFilePath(userData);
    expect(path).toBe(join(userData, PERF_TRACE_FILENAME));
    const result = flushPerfTraceToUserData(userData);
    expect(result.ok).toBe(true);
    expect(result.path).toBe(path);
    expect(existsSync(path!)).toBe(true);
    // No leftover temp files
    const names = readdirSync(userData);
    expect(names.filter((n) => n.includes(".tmp"))).toHaveLength(0);
    const body = readFileSync(path!, "utf8");
    const lines = body.trim().split("\n");
    expect(lines.length).toBe(6); // 5 data + terminal
    const terminal = JSON.parse(lines[lines.length - 1]!);
    expect(terminal.operation).toBe("probe-terminal");
    expect(terminal.acceptedRows).toBe(5);
  });

  it("flush is idempotent; path stays a fixed basename under userData", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    _resetPerfTraceFileForTests();
    perfTrace({
      operation: "synthetic",
      outcome: "ok",
      startMs: 1,
      durationMs: 1,
    });
    const first = flushPerfTraceToUserData(userData);
    const second = flushPerfTraceToUserData(userData);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.reason).toBe("already-flushed");
    const path = getPerfTraceFilePath(userData);
    expect(path?.endsWith(PERF_TRACE_FILENAME)).toBe(true);
    expect(path?.includes("..")).toBe(false);
    expect(getPerfTraceFilePath("")).toBeNull();
  });

  it("write failure leaves no accepted partial final file", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    _resetPerfTraceFileForTests();
    perfTrace({
      operation: "synthetic",
      outcome: "ok",
      startMs: 1,
      durationMs: 1,
    });
    // Point at a file path as userData so rename/write fails closed.
    const fileAsDir = join(userData, "not-a-dir");
    writeFileSync(fileAsDir, "x");
    const result = flushPerfTraceToUserData(fileAsDir);
    expect(result.ok).toBe(false);
    expect(existsSync(join(fileAsDir, PERF_TRACE_FILENAME))).toBe(false);
  });

  it("before-quit fallback flushes once", () => {
    process.env["GOGMEET_PERF_TRACE"] = "1";
    _resetPerfTraceForTests();
    _resetPerfTraceFileForTests();
    perfTrace({
      operation: "synthetic",
      outcome: "ok",
      startMs: 1,
      durationMs: 1,
    });
    const listeners: Array<() => void> = [];
    const appLike = {
      getPath: (name: "userData") => {
        expect(name).toBe("userData");
        return userData;
      },
      once: (_event: "before-quit", listener: () => void) => {
        listeners.push(listener);
      },
    };
    registerPerfTraceBeforeQuitFlush(appLike);
    registerPerfTraceBeforeQuitFlush(appLike); // idempotent registration
    expect(listeners).toHaveLength(1);
    listeners[0]!();
    expect(existsSync(join(userData, PERF_TRACE_FILENAME))).toBe(true);
  });
});
