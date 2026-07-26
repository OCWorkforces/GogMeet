import type { MeetingEvent } from "../../shared/meeting-event.js";
import { cleanDescription } from "../calendar/clean-description.js";
import {
  brandTimestamps,
  parseEventIdField,
  parseMeetUrlField,
  parseTimestampPair,
} from "./event-field-parser.js";
import type { ParseDiagnostic } from "./event-validator.js";
import { isStringTupleOfLength } from "./guards.js";

const EXPECTED_FIELD_COUNT = 9;

/** Structured result of {@link parseEvents}: parsed events plus diagnostics for skipped lines. */
export interface ParseResult {
  readonly events: readonly MeetingEvent[];
  readonly diagnostics: readonly ParseDiagnostic[];
}

/** Parse JSON Lines output from Swift helper into a {@link ParseResult}.
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

  const lines = raw.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").replace(/\r$/u, "");
    if (!line) continue;
    const lineNumber = i + 1;

    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch (error) {
      if (error instanceof SyntaxError) {
        diagnostics.push({ line: lineNumber, reason: "malformed_record" });
        continue;
      }
      throw error;
    }

    if (!Array.isArray(record) || !record.every((field) => typeof field === "string")) {
      diagnostics.push({ line: lineNumber, reason: "malformed_record" });
      continue;
    }

    const fields = record;
    if (!isStringTupleOfLength(fields, EXPECTED_FIELD_COUNT)) {
      diagnostics.push({
        line: lineNumber,
        reason: "malformed_field_count",
      });
      continue;
    }
    const [id, title, startStr, endStr, urlField, calendarName, allDayStr, emailField, notesField] =
      fields;

    const timestamps = parseTimestampPair(startStr, endStr);
    if (!timestamps) {
      diagnostics.push({
        line: lineNumber,
        reason: "invalid_iso",
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
      });
      continue;
    }
    const uid = idResult.value;

    // Deduplicate by id (first-wins); record diagnostic for observability
    if (seen.has(uid)) {
      diagnostics.push({
        line: lineNumber,
        reason: "duplicate_uid",
      });
      continue;
    }
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
      ...(notesField?.trim() ? { description: cleanDescription(notesField) } : {}),
    });
  }

  events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return { events, diagnostics };
}
