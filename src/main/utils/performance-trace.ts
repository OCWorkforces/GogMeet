/**
 * Opt-in, redacted, bounded performance trace primitive.
 * Enabled only when GOGMEET_PERF_TRACE=1. Finite allowlist only — no arbitrary strings.
 * File ownership (atomic flush under userData) lives in performance-trace-file.ts.
 */

export const PERF_TRACE_VERSION = 1 as const;

/** Max data rows retained in memory (terminal row reserved separately). */
export const MAX_PERF_TRACE_ROWS = 1024 as const;
/** Max serialized JSONL bytes for the published buffer (incl. terminal). */
export const MAX_PERF_TRACE_SERIALIZED_BYTES: number = 1 * 1024 * 1024;

/** Finite operation enum — extend only with explicit product-path marks. */
export const PERF_TRACE_OPERATIONS = [
  "google-http",
  "swift-helper",
  "calendar-poll",
  "scheduler-plan",
  "tray-rebuild",
  "startup-phase",
  "probe-terminal",
  "alert-lifecycle",
  "safe-storage",
  "build-package",
  "synthetic",
] as const;

export type PerfTraceOperation = (typeof PERF_TRACE_OPERATIONS)[number];

/** Finite startup-phase identities for safe packaged lifecycle receipts. */
export const PERF_TRACE_STARTUP_PHASES = [
  "process-start",
  "electron-ready",
  "window-create-load",
  "app-graph",
  "warmup-dispatch",
  "ipc-register",
  "settings-permission",
  "tray",
  "scheduler",
  "watcher",
  "first-poll",
  "updater",
  "helper-spawn",
  "helper-query",
  "helper-parse",
  "power-events",
  "global-shortcuts",
  "notification-permission",
  "auto-launch",
  "oauth",
  "shell-egress",
] as const;

export type PerfTraceStartupPhase = (typeof PERF_TRACE_STARTUP_PHASES)[number];

export const PERF_TRACE_ERROR_CLASSES = [
  "timeout",
  "abort",
  "payload-too-large",
  "auth",
  "rate-limit",
  "server",
  "protocol",
  "network",
  "spawn",
  "integrity",
  "unknown",
] as const;

export type PerfTraceErrorClass = (typeof PERF_TRACE_ERROR_CLASSES)[number];

export type PerfTraceOutcome = "ok" | "error" | "not-exercised" | "dropped";
export type PerfTracePowerMode = "ac" | "battery" | "unknown";

export interface PerfTraceRecordBase {
  readonly version: typeof PERF_TRACE_VERSION;
  readonly operation: PerfTraceOperation;
  readonly outcome: PerfTraceOutcome;
  readonly errorClass?: PerfTraceErrorClass;
  readonly startMs: number;
  readonly durationMs: number;
  readonly count?: number;
  readonly bytes?: number;
  readonly platform: string;
  readonly arch: string;
  readonly powerMode: PerfTracePowerMode;
  /** Required when operation is startup-phase. */
  readonly phase?: PerfTraceStartupPhase;
  /** probe-terminal only: accepted data rows (excludes terminal). */
  readonly acceptedRows?: number;
  /** probe-terminal only: dropped data rows after caps. */
  readonly droppedRows?: number;
  /** probe-terminal only: accepted serialized data bytes. */
  readonly acceptedBytes?: number;
  /** probe-terminal only: dropped serialized data bytes. */
  readonly droppedBytes?: number;
}

export type PerfTraceRecord = PerfTraceRecordBase;

const FORBIDDEN_KEY_PATTERN =
  /token|authorization|email|password|secret|title|description|url|pkce|verifier|body|payload|cipher/i;

const ALLOWED_INPUT_KEYS = new Set([
  "operation",
  "outcome",
  "errorClass",
  "startMs",
  "durationMs",
  "count",
  "bytes",
  "powerMode",
  "phase",
  "acceptedRows",
  "droppedRows",
  "acceptedBytes",
  "droppedBytes",
]);

let enabledCache: boolean | null = null;
/** Data rows only (never includes the reserved terminal row until flush materializes it). */
const records: PerfTraceRecord[] = [];
let droppedRows = 0;
let droppedBytes = 0;
let acceptedSerializedBytes = 0;
let terminalFlushed = false;

export function isPerfTraceEnabled(): boolean {
  if (enabledCache === null) {
    enabledCache = process.env["GOGMEET_PERF_TRACE"] === "1";
  }
  return enabledCache;
}

/** Test-only: reset enable cache, buffer, and drop counters. */
export function _resetPerfTraceForTests(): void {
  enabledCache = null;
  records.length = 0;
  droppedRows = 0;
  droppedBytes = 0;
  acceptedSerializedBytes = 0;
  terminalFlushed = false;
}

function isOperation(value: string): value is PerfTraceOperation {
  return (PERF_TRACE_OPERATIONS as readonly string[]).includes(value);
}

function isErrorClass(value: string): value is PerfTraceErrorClass {
  return (PERF_TRACE_ERROR_CLASSES as readonly string[]).includes(value);
}

function isStartupPhase(value: string): value is PerfTraceStartupPhase {
  return (PERF_TRACE_STARTUP_PHASES as readonly string[]).includes(value);
}

function isOutcome(value: string): value is PerfTraceOutcome {
  return value === "ok" || value === "error" || value === "not-exercised" || value === "dropped";
}

function isPowerMode(value: string): value is PerfTracePowerMode {
  return value === "ac" || value === "battery" || value === "unknown";
}

function estimateSerializedBytes(record: PerfTraceRecord): number {
  // JSONL line + newline; deterministic upper bound via JSON.stringify.
  return Buffer.byteLength(JSON.stringify(record), "utf8") + 1;
}

/** Approximate terminal row size so we can reserve capacity before accepting data rows. */
function terminalReservationBytes(): number {
  const sample: PerfTraceRecord = {
    version: PERF_TRACE_VERSION,
    operation: "probe-terminal",
    outcome: "ok",
    startMs: 0,
    durationMs: 0,
    platform: "darwin",
    arch: "arm64",
    powerMode: "unknown",
    acceptedRows: MAX_PERF_TRACE_ROWS,
    droppedRows: MAX_PERF_TRACE_ROWS,
    acceptedBytes: MAX_PERF_TRACE_SERIALIZED_BYTES,
    droppedBytes: MAX_PERF_TRACE_SERIALIZED_BYTES,
  };
  return estimateSerializedBytes(sample);
}

const TERMINAL_RESERVE_BYTES = terminalReservationBytes();

export type PerfTraceInput =
  | {
      operation: Exclude<PerfTraceOperation, "startup-phase" | "probe-terminal">;
      outcome: PerfTraceOutcome;
      errorClass?: PerfTraceErrorClass;
      startMs: number;
      durationMs: number;
      count?: number;
      bytes?: number;
      powerMode?: PerfTracePowerMode;
    }
  | {
      operation: "startup-phase";
      phase: PerfTraceStartupPhase;
      outcome: PerfTraceOutcome;
      errorClass?: PerfTraceErrorClass;
      startMs: number;
      durationMs: number;
      count?: number;
      bytes?: number;
      powerMode?: PerfTracePowerMode;
    }
  | {
      operation: "probe-terminal";
      outcome: PerfTraceOutcome;
      startMs: number;
      durationMs: number;
      acceptedRows: number;
      droppedRows: number;
      acceptedBytes: number;
      droppedBytes: number;
      powerMode?: PerfTracePowerMode;
    };

/**
 * Record one redacted trace row. No-ops when tracing is disabled.
 * Rejects forbidden keys/values and unknown enums without throwing into product paths.
 * Caps rows/bytes; drops new data rows after either cap (reserves terminal capacity).
 */
export function perfTrace(input: PerfTraceInput): void {
  if (!isPerfTraceEnabled()) return;

  try {
    appendPerfTrace(input);
  } catch {
    // Never throw into product paths from tracing.
  }
}

function appendPerfTrace(input: PerfTraceInput): void {
  if (!isOperation(input.operation)) return;
  if (!isOutcome(input.outcome)) return;
  // Terminal rows are synthesized at flush time; reject caller inserts.
  if (input.operation === "probe-terminal") return;
  if (!Number.isFinite(input.startMs) || !Number.isFinite(input.durationMs)) return;
  if (input.durationMs < 0) return;

  for (const key of Object.keys(input)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) return;
    if (!ALLOWED_INPUT_KEYS.has(key)) return;
  }

  if (input.operation === "startup-phase") {
    if (!("phase" in input) || typeof input.phase !== "string" || !isStartupPhase(input.phase)) {
      return;
    }
  } else if ("phase" in input && input.phase !== undefined) {
    return;
  }

  // Narrowed: not probe-terminal after early return above.
  const dataInput = input;
  const maybeErrorClass = "errorClass" in dataInput ? dataInput.errorClass : undefined;
  if (maybeErrorClass !== undefined && !isErrorClass(maybeErrorClass)) return;

  const count = "count" in dataInput ? dataInput.count : undefined;
  const bytes = "bytes" in dataInput ? dataInput.bytes : undefined;
  if (count !== undefined && (!Number.isFinite(count) || count < 0)) return;
  if (bytes !== undefined && (!Number.isFinite(bytes) || bytes < 0)) return;

  const powerMode =
    dataInput.powerMode !== undefined && isPowerMode(dataInput.powerMode)
      ? dataInput.powerMode
      : "unknown";

  const record: PerfTraceRecord = {
    version: PERF_TRACE_VERSION,
    operation: dataInput.operation,
    outcome: dataInput.outcome,
    ...(maybeErrorClass !== undefined ? { errorClass: maybeErrorClass } : {}),
    startMs: dataInput.startMs,
    durationMs: dataInput.durationMs,
    ...(count !== undefined ? { count } : {}),
    ...(bytes !== undefined ? { bytes } : {}),
    platform: process.platform,
    arch: process.arch,
    powerMode,
    ...(dataInput.operation === "startup-phase" ? { phase: dataInput.phase } : {}),
  };

  const rowBytes = estimateSerializedBytes(record);
  const rowCapReached = records.length >= MAX_PERF_TRACE_ROWS;
  const byteCapReached =
    acceptedSerializedBytes + rowBytes + TERMINAL_RESERVE_BYTES > MAX_PERF_TRACE_SERIALIZED_BYTES;

  if (rowCapReached || byteCapReached) {
    droppedRows += 1;
    droppedBytes += rowBytes;
    return;
  }

  records.push(record);
  acceptedSerializedBytes += rowBytes;
}

export function getPerfTraceRecords(): readonly PerfTraceRecord[] {
  return records;
}

export function getPerfTraceDropStats(): {
  acceptedRows: number;
  droppedRows: number;
  acceptedBytes: number;
  droppedBytes: number;
} {
  return {
    acceptedRows: records.length,
    droppedRows,
    acceptedBytes: acceptedSerializedBytes,
    droppedBytes,
  };
}

/** Build the reserved terminal row from current counters (not pushed into data buffer). */
export function buildProbeTerminalRecord(
  startMs: number = 0,
  durationMs: number = 0,
): PerfTraceRecord {
  return {
    version: PERF_TRACE_VERSION,
    operation: "probe-terminal",
    outcome: "ok",
    startMs,
    durationMs,
    platform: process.platform,
    arch: process.arch,
    powerMode: "unknown",
    acceptedRows: records.length,
    droppedRows,
    acceptedBytes: acceptedSerializedBytes,
    droppedBytes,
  };
}

/**
 * Serialize data rows + exactly one terminal row.
 * Idempotent regarding terminal accounting for in-memory export.
 */
export function perfTraceToJsonl(options?: { includeTerminal?: boolean }): string {
  const includeTerminal = options?.includeTerminal !== false;
  const lines = records.map((r) => JSON.stringify(r));
  if (includeTerminal) {
    lines.push(JSON.stringify(buildProbeTerminalRecord()));
  }
  return lines.join("\n");
}

/** Mark that a terminal row was published via file flush (test/file helper). */
export function _markTerminalFlushedForTests(): void {
  terminalFlushed = true;
}

export function wasTerminalFlushed(): boolean {
  return terminalFlushed;
}
