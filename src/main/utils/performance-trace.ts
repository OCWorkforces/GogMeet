/**
 * Opt-in, redacted performance trace primitive.
 * Enabled only when GOGMEET_PERF_TRACE=1. Finite allowlist only — no arbitrary strings.
 */

export const PERF_TRACE_VERSION = 1 as const;

/** Finite operation enum — extend only with explicit product-path marks. */
export const PERF_TRACE_OPERATIONS = [
  "google-http",
  "swift-helper",
  "calendar-poll",
  "scheduler-plan",
  "tray-rebuild",
  "startup-phase",
  "alert-lifecycle",
  "safe-storage",
  "build-package",
  "synthetic",
] as const;

export type PerfTraceOperation = (typeof PERF_TRACE_OPERATIONS)[number];

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

export type PerfTraceOutcome = "ok" | "error";
export type PerfTracePowerMode = "ac" | "battery" | "unknown";

export interface PerfTraceRecord {
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
}

const FORBIDDEN_KEY_PATTERN =
  /token|authorization|email|password|secret|title|description|url|pkce|verifier|body|payload|cipher/i;

let enabledCache: boolean | null = null;
const records: PerfTraceRecord[] = [];

export function isPerfTraceEnabled(): boolean {
  if (enabledCache === null) {
    enabledCache = process.env["GOGMEET_PERF_TRACE"] === "1";
  }
  return enabledCache;
}

/** Test-only: reset enable cache and buffer. */
export function _resetPerfTraceForTests(): void {
  enabledCache = null;
  records.length = 0;
}

function isOperation(value: string): value is PerfTraceOperation {
  return (PERF_TRACE_OPERATIONS as readonly string[]).includes(value);
}

function isErrorClass(value: string): value is PerfTraceErrorClass {
  return (PERF_TRACE_ERROR_CLASSES as readonly string[]).includes(value);
}

/**
 * Record one redacted trace row. No-ops when tracing is disabled.
 * Rejects forbidden keys/values and unknown enums without throwing into product paths.
 */
export function perfTrace(input: {
  operation: PerfTraceOperation;
  outcome: PerfTraceOutcome;
  errorClass?: PerfTraceErrorClass;
  startMs: number;
  durationMs: number;
  count?: number;
  bytes?: number;
  powerMode?: PerfTracePowerMode;
}): void {
  if (!isPerfTraceEnabled()) return;

  if (!isOperation(input.operation)) return;
  if (input.outcome !== "ok" && input.outcome !== "error") return;
  if (input.errorClass !== undefined && !isErrorClass(input.errorClass)) return;
  if (!Number.isFinite(input.startMs) || !Number.isFinite(input.durationMs)) return;
  if (input.durationMs < 0) return;
  if (input.count !== undefined && (!Number.isFinite(input.count) || input.count < 0)) return;
  if (input.bytes !== undefined && (!Number.isFinite(input.bytes) || input.bytes < 0)) return;

  // Guard against accidental metadata bags via runtime key scan of the input object.
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) return;
  }

  const record: PerfTraceRecord = {
    version: PERF_TRACE_VERSION,
    operation: input.operation,
    outcome: input.outcome,
    ...(input.errorClass !== undefined ? { errorClass: input.errorClass } : {}),
    startMs: input.startMs,
    durationMs: input.durationMs,
    ...(input.count !== undefined ? { count: input.count } : {}),
    ...(input.bytes !== undefined ? { bytes: input.bytes } : {}),
    platform: process.platform,
    arch: process.arch,
    powerMode: input.powerMode ?? "unknown",
  };

  records.push(record);
}

export function getPerfTraceRecords(): readonly PerfTraceRecord[] {
  return records;
}

export function perfTraceToJsonl(): string {
  return records.map((r) => JSON.stringify(r)).join("\n");
}
