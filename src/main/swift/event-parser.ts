import type { MeetingEvent } from "../../shared/models.js";
import { asEventId, asIsoUtc, asMeetUrl } from "../../shared/brand.js";
import { isExecErrorLike, isStringTupleOfLength } from "./guards.js";

/** Number of tab-delimited fields expected per Swift output line. */
const EXPECTED_FIELD_COUNT = 9;

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

/** Strip Outlook/Exchange HTML-to-plaintext border artifacts from event notes. */
export function cleanDescription(notes: string): string {
  return notes
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;

      // Outlook text-border: -::~:~::~:~:...:~::-
      if (/^[-~:]+$/.test(trimmed) && trimmed.length > 10) return false;

      // Long separator lines (underscores, dashes, asterisks)
      if (/^[_\-\*]{5,}$/.test(trimmed)) return false;

      // Outlook bordered separators: * ___ * or similar
      if (/^[\*_][\s_\-\*]+[\*_]$/.test(trimmed)) return false;

      return true;
    })
    .join("\n")
    .trim();
}

/** Parse an ISO8601 date string from the Swift helper.
 *
 * The Swift `ISO8601DateFormatter` always emits UTC (e.g.
 * "2026-04-21T14:30:00Z"). Defensive: if the string lacks any timezone marker
 * ('Z' or '+HH:MM' / '-HH:MM' offset), append 'Z' to force UTC interpretation
 * — never re-append if a marker is already present (avoids "...ZZ"). */
function parseIsoUtc(raw: string): Date {
  const trimmed = raw.trim();
  // Detect existing TZ designator: trailing 'Z' or ±HH:MM offset on time portion
  const hasTz = /Z$/i.test(trimmed) || /[+\-]\d{2}:?\d{2}$/.test(trimmed);
  return new Date(hasTz ? trimmed : `${trimmed}Z`);
}

/** Reason codes for parse diagnostics emitted by {@link parseEvents}. */
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

/** Structured result of {@link parseEvents}: parsed events plus diagnostics for skipped lines. */
export interface ParseResult {
  readonly events: readonly MeetingEvent[];
  readonly diagnostics: readonly ParseDiagnostic[];
}

/** Truncate a raw line for diagnostic preview to keep logs bounded. */
function previewLine(line: string): string {
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

/** Parse tab-delimited output from Swift helper into a {@link ParseResult}.
 *
 * Strictly requires exactly {@link EXPECTED_FIELD_COUNT} fields per line. Any
 * malformed line is skipped and recorded as a {@link ParseDiagnostic} entry on
 * the returned result so callers can observe / log them centrally.
 *
 * Out-of-range (not today/tomorrow) and duplicate-by-id lines are filtered
 * silently (these are normal, not errors). */
export function parseEvents(raw: string): ParseResult {
  if (!raw) return { events: [], diagnostics: [] };

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const searchEnd = new Date(todayMidnight);
  searchEnd.setDate(searchEnd.getDate() + 2);

  const seen = new Set<string>();
  const diagnostics: ParseDiagnostic[] = [];
  const events: MeetingEvent[] = [];

  const lines = raw
    .split("\n")
    .map((line) => line.replace(/[\r\n]+$/u, ""));

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line) continue;
    const lineNumber = i + 1;

    const fields = line.split("\t");
    if (!isStringTupleOfLength(fields, EXPECTED_FIELD_COUNT)) {
      diagnostics.push({
        line: lineNumber,
        reason: "malformed_field_count",
        raw: previewLine(line),
      });
      continue;
    }
    const [
      id,
      title,
      startStr,
      endStr,
      urlField,
      calendarName,
      allDayStr,
      emailField,
      notesField,
    ] = fields;

    const startDate = parseIsoUtc(startStr);
    const endDate = parseIsoUtc(endStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      diagnostics.push({
        line: lineNumber,
        reason: "invalid_iso",
        raw: previewLine(line),
      });
      continue;
    }

    // Guard: only today + tomorrow (silent filter, not an error)
    if (startDate < todayMidnight || startDate >= searchEnd) continue;

    // Brand id (must be non-empty after trim)
    const idResult = asEventId(id);
    if (!idResult.ok) {
      diagnostics.push({
        line: lineNumber,
        reason: "invalid_id",
        raw: previewLine(line),
      });
      continue;
    }
    const uid = idResult.value;

    // Deduplicate by id (silent filter)
    if (seen.has(uid)) continue;
    seen.add(uid);

    // Brand timestamps via the validator. toISOString() always emits a
    // canonical Z-suffixed string, so this is effectively a typed handshake;
    // any failure here would indicate a programmer error and is treated as
    // an invalid_iso diagnostic for symmetry with the parse-time check.
    const startBrand = asIsoUtc(startDate.toISOString());
    const endBrand = asIsoUtc(endDate.toISOString());
    if (!startBrand.ok || !endBrand.ok) {
      diagnostics.push({
        line: lineNumber,
        reason: "invalid_iso",
        raw: previewLine(line),
      });
      continue;
    }

    // Brand meetUrl when present. Failure is non-fatal — we keep the event
    // but drop the URL so downstream join actions are simply unavailable.
    let brandedMeetUrl: MeetingEvent["meetUrl"];
    const rawMeetUrl = urlField.trim();
    if (rawMeetUrl) {
      const urlResult = asMeetUrl(rawMeetUrl);
      if (urlResult.ok) {
        brandedMeetUrl = urlResult.value;
      }
    }

    events.push({
      id: uid,
      title: title.trim(),
      startDate: startBrand.value,
      endDate: endBrand.value,
      ...(brandedMeetUrl ? { meetUrl: brandedMeetUrl } : {}),
      calendarName: calendarName.trim(),
      isAllDay: allDayStr.trim() === "true",
      ...(emailField?.trim() ? { userEmail: emailField.trim() } : {}),
      ...(notesField?.trim()
        ? { description: cleanDescription(notesField) }
        : {}),
    });
  }

  events.sort(
    (a, b) =>
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );

  return { events, diagnostics };
}
