import type { Result } from "../../shared/result.js";
import type { EventId, IsoUtc, MeetUrl } from "../../shared/brand.js";
import { asEventId, asIsoUtc, asMeetUrl } from "../../shared/brand.js";
import { parseIsoUtc } from "./event-validator.js";

/** Strip HTML tags from event notes. CalDAV-synced events (e.g. Google Calendar)
 *  via macOS Calendar) may contain raw HTML like `<a href="...">link</a>` in the notes field.
 *  EventKit returns this verbatim; stripping ensures downstream consumers see plain text. */
function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

/** Strip Outlook/Exchange HTML-to-plaintext border artifacts from event notes,
 *  and remove any HTML tags present in CalDAV-synced event descriptions. */
export function cleanDescription(notes: string): string {
  return stripHtmlTags(notes)
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

/** Parsed timestamp pair as native Date objects (pre-brand). */
export interface ParsedTimestamps {
  readonly start: Date;
  readonly end: Date;
}

/** Parse and validate the start/end ISO timestamp pair from raw Swift fields. */
export function parseTimestampPair(
  startStr: string,
  endStr: string,
): ParsedTimestamps | null {
  const start = parseIsoUtc(startStr);
  const end = parseIsoUtc(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

/** Brand a Date pair into IsoUtc values via canonical ISO8601 round-trip. */
export function brandTimestamps(
  start: Date,
  end: Date,
): { start: IsoUtc; end: IsoUtc } | null {
  const startBrand = asIsoUtc(start.toISOString());
  const endBrand = asIsoUtc(end.toISOString());
  if (!startBrand.ok || !endBrand.ok) return null;
  return { start: startBrand.value, end: endBrand.value };
}

/** Validate and brand the event id field. */
export function parseEventIdField(raw: string): Result<EventId, string> {
  return asEventId(raw);
}

/** Validate and brand the optional meet URL field. Returns `undefined` when
 * the field is empty or fails brand validation (URL is non-fatal). */
export function parseMeetUrlField(raw: string): MeetUrl | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const result = asMeetUrl(trimmed);
  return result.ok ? result.value : undefined;
}
