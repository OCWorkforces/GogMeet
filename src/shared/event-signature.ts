/**
 * Stable event signature helper.
 *
 * Pure, deterministic identity/equality helpers for {@link MeetingEvent} values.
 * Used by main (scheduler change detection) and renderer (list re-render gating)
 * to compare event content without relying on object reference equality, key
 * insertion order, or array order.
 *
 * The signature intentionally covers fields that affect scheduling and display
 * identity. {@link MeetingEvent.description} is excluded: notes change often
 * and do not influence scheduling, the tray list shape, or alert payloads.
 */

import type { MeetingEvent } from "./meeting-event.js";

/**
 * The subset of {@link MeetingEvent} fields that participate in the signature.
 *
 * Sorted alphabetically and frozen so callers can rely on a stable enumeration
 * order across processes and across runs.
 */
export const EVENT_SIGNATURE_FIELDS: readonly (keyof MeetingEvent)[] = Object.freeze([
  "calendarName",
  "endDate",
  "id",
  "isAllDay",
  "meetUrl",
  "startDate",
  "title",
  "userEmail",
]);

const FIELD_SEPARATOR = "\u001f"; // ASCII unit separator
const RECORD_SEPARATOR = "\u001e"; // ASCII record separator
const ABSENT = "\u0000"; // distinct from the empty string

function encodeField(value: unknown): string {
  if (value === undefined) {
    return ABSENT;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

/**
 * Produce a deterministic string signature of a single event.
 *
 * The signature is independent of object key insertion order: only the fields
 * listed in {@link EVENT_SIGNATURE_FIELDS} contribute, and they are emitted in
 * that fixed order. Equality of two signatures implies equality of every
 * participating field.
 */
export function eventSignature(event: MeetingEvent): string {
  const parts: string[] = [];
  for (const field of EVENT_SIGNATURE_FIELDS) {
    parts.push(field, encodeField(event[field]));
  }
  return parts.join(FIELD_SEPARATOR);
}

/**
 * Produce a deterministic signature for a list of events.
 *
 * The result is independent of the input array order: events are sorted by
 * their per-event signature before concatenation. Lists of different length
 * always produce different signatures.
 */
export function eventListSignature(events: readonly MeetingEvent[]): string {
  if (events.length === 0) {
    return "0";
  }
  const sigs = events.map(eventSignature);
  sigs.sort();
  return `${events.length}${RECORD_SEPARATOR}${sigs.join(RECORD_SEPARATOR)}`;
}
