import { isExecErrorLike } from "./guards.js";

/** Structured exit codes emitted by `googlemeet-events.swift`. Keep in sync. */
export const SWIFT_EXIT_CODES = {
  SUCCESS: 0,
  PERMISSION_DENIED: 2,
  NO_CALENDARS: 3,
  OTHER: 4,
} as const;

export type SwiftErrorKind =
  | "permission-denied"
  | "no-calendars"
  | "swift-error"
  | "unknown";

/** Error thrown by the Swift helper, classified by structured exit code. */
export class SwiftHelperError extends Error {
  readonly kind: SwiftErrorKind;
  readonly exitCode: number | undefined;
  readonly stderr: string | undefined;

  constructor(
    kind: SwiftErrorKind,
    message: string,
    exitCode: number | undefined,
    stderr: string | undefined,
  ) {
    super(message);
    this.name = "SwiftHelperError";
    this.kind = kind;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/** Map a child_process error (with `.code` set to the exit status) to a typed
 * SwiftHelperError. Non-numeric `.code` (e.g. "ENOENT") falls through to
 * "unknown" — the caller should preserve the original error context. */
export function classifySwiftError(err: unknown): SwiftHelperError {
  if (!isExecErrorLike(err)) {
    return new SwiftHelperError("unknown", "Swift helper failed", undefined, undefined);
  }
  const e = err;
  const stderr =
    typeof e?.stderr === "string"
      ? e.stderr.trim() || undefined
      : undefined;
  const baseMessage =
    typeof e?.message === "string" && e.message.length > 0
      ? e.message
      : "Swift helper failed";

  if (typeof e?.code === "number") {
    switch (e.code) {
      case SWIFT_EXIT_CODES.PERMISSION_DENIED:
        return new SwiftHelperError(
          "permission-denied",
          "Calendar permission denied. Grant access in System Settings → Privacy & Security → Calendars.",
          e.code,
          stderr,
        );
      case SWIFT_EXIT_CODES.NO_CALENDARS:
        return new SwiftHelperError(
          "no-calendars",
          "No calendars are available to query.",
          e.code,
          stderr,
        );
      case SWIFT_EXIT_CODES.OTHER:
        return new SwiftHelperError(
          "swift-error",
          `Swift helper error: ${stderr ?? baseMessage}`,
          e.code,
          stderr,
        );
      default:
        return new SwiftHelperError(
          "unknown",
          `Swift helper exited with code ${e.code}: ${stderr ?? baseMessage}`,
          e.code,
          stderr,
        );
    }
  }

  return new SwiftHelperError("unknown", baseMessage, undefined, stderr);
}

/** Parse an ISO8601 date string from the Swift helper.
 *
 * The Swift `ISO8601DateFormatter` always emits UTC (e.g.
 * "2026-04-21T14:30:00Z"). Defensive: if the string lacks any timezone marker
 * ('Z' or '+HH:MM' / '-HH:MM' offset), append 'Z' to force UTC interpretation
 * — never re-append if a marker is already present (avoids "...ZZ"). */
export function parseIsoUtc(raw: string): Date {
  const trimmed = raw.trim();
  // Detect existing TZ designator: trailing 'Z' or ±HH:MM / ±HHMM offset on time portion
  const hasTz = /Z$/i.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed);
  const result = new Date(hasTz ? trimmed : `${trimmed}Z`);
  // Guard: if the ±offset regex matched but produced an invalid Date (e.g. "+99:99"),
  // strip the bogus offset and reinterpret the datetime as UTC so the caller's
  // isNaN check can emit a useful diagnostic instead of propagating a silent NaN.
  if (isNaN(result.getTime()) && hasTz && !/Z$/i.test(trimmed)) {
    const stripped = trimmed.replace(/[+-]\d{2}:?\d{2}$/, "");
    return new Date(`${stripped}Z`);
  }
  return result;
}

/** Reason codes for parse diagnostics emitted by `parseEvents`. */
export type ParseDiagnosticReason =
  | "malformed_field_count"
  | "invalid_iso"
  | "invalid_id";

/** Diagnostic record for a single malformed input line. */
export interface ParseDiagnostic {
  readonly line: number;
  readonly reason: ParseDiagnosticReason;
  readonly raw?: string;
}

/** Truncate a raw line for diagnostic preview to keep logs bounded. */
export function previewLine(line: string): string {
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}
