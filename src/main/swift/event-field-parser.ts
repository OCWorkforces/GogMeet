import type { Result } from "../../shared/result.js";
import type { EventId, IsoUtc, MeetUrl } from "../../shared/brand.js";
import { asEventId, asIsoUtc } from "../../shared/brand.js";
import { validateMeetUrl } from "../utils/url-validation.js";
import { parseIsoUtc } from "./event-validator.js";

/** Parsed timestamp pair as native Date objects (pre-brand). */
export interface ParsedTimestamps {
  readonly start: Date;
  readonly end: Date;
}

/** Parse and validate the start/end ISO timestamp pair from raw Swift fields. */
export function parseTimestampPair(startStr: string, endStr: string): ParsedTimestamps | null {
  const start = parseIsoUtc(startStr);
  const end = parseIsoUtc(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  if (end.getTime() < start.getTime()) return null;
  return { start, end };
}

/** Brand a Date pair into IsoUtc values via canonical ISO8601 round-trip. */
export function brandTimestamps(start: Date, end: Date): { start: IsoUtc; end: IsoUtc } | null {
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
 * the field is empty or fails brand validation (URL is non-fatal).
 *
 * Normalizes URLs that lack a scheme prefix (e.g. `zoom.us/j/123`) by
 * prepending `https://`, matching the behavior of `buildMeetUrl()` in meet-url.ts.
 */
export function parseMeetUrlField(raw: string): MeetUrl | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Normalize: prepend https:// if no scheme present (calendar events may
  // store bare URLs like "zoom.us/j/123" without a protocol prefix).
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const result = validateMeetUrl(normalized);
  return result.ok ? result.value : undefined;
}
