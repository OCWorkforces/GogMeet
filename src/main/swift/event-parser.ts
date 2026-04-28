import type { MeetingEvent } from "../../shared/models.js";
import {
  brandTimestamps,
  cleanDescription,
  parseEventIdField,
  parseMeetUrlField,
  parseTimestampPair,
} from "./event-field-parser.js";
import type { ParseDiagnostic } from "./event-validator.js";
import { previewLine } from "./event-validator.js";
import { isStringTupleOfLength } from "./guards.js";

// Re-exports preserve the public surface of this module.
export { SWIFT_EXIT_CODES, SwiftHelperError, classifySwiftError } from "./event-validator.js";
export type { ParseDiagnostic, ParseDiagnosticReason, SwiftErrorKind } from "./event-validator.js";
export { cleanDescription } from "./event-field-parser.js";

const EXPECTED_FIELD_COUNT = 9;

/** Structured result of {@link parseEvents}: parsed events plus diagnostics for skipped lines. */
export interface ParseResult {
  readonly events: readonly MeetingEvent[];
  readonly diagnostics: readonly ParseDiagnostic[];
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

    const timestamps = parseTimestampPair(startStr, endStr);
    if (!timestamps) {
      diagnostics.push({
        line: lineNumber,
        reason: "invalid_iso",
        raw: previewLine(line),
      });
      continue;
    }

    // Guard: only today + tomorrow (silent filter, not an error)
    if (timestamps.start < todayMidnight || timestamps.start >= searchEnd) continue;

    // Brand id (must be non-empty after trim)
    const idResult = parseEventIdField(id);
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
    const branded = brandTimestamps(timestamps.start, timestamps.end);
    if (!branded) {
      diagnostics.push({
        line: lineNumber,
        reason: "invalid_iso",
        raw: previewLine(line),
      });
      continue;
    }

    // Brand meetUrl when present. Failure is non-fatal — we keep the event
    // but drop the URL so downstream join actions are simply unavailable.
    const brandedMeetUrl = parseMeetUrlField(urlField);

    events.push({
      id: uid,
      title: title.trim(),
      startDate: branded.start,
      endDate: branded.end,
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
