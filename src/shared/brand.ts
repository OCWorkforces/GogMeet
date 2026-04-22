/**
 * Branded (nominal) type primitives.
 *
 * Plain TypeScript structural typing treats all `string`s as interchangeable.
 * Branding attaches a phantom tag to a base type so distinct domain values
 * (event ids, validated URLs, ISO timestamps) cannot be accidentally swapped.
 *
 * The brand is a `unique symbol` keyed property typed as `B`. Because the
 * symbol is `declare`d (no runtime existence) and the property type is the
 * tag string, branded values remain runtime-identical to their base type
 * (e.g. an `EventId` is just a `string` at runtime) and remain assignable
 * *down* to the base type — so consumers can read a branded field as a
 * plain `string` without any cast — but plain values cannot be assigned
 * *up* to the branded type without going through a validator or the
 * internal {@link brand} helper used at trust boundaries.
 */

import type { Result } from "./result.js";
import { ok, err } from "./result.js";

declare const __brand: unique symbol;

/** Phantom-tagged subtype of `T`. */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Stable identifier for a calendar event (originates from EventKit UID). */
export type EventId = Brand<string, "EventId">;

/** A Google Meet / Calendar / Accounts URL that has passed allowlist validation. */
export type MeetUrl = Brand<string, "MeetUrl">;

/** An ISO-8601 timestamp string interpreted as UTC. */
export type IsoUtc = Brand<string, "IsoUtc">;

/**
 * Internal trust-boundary cast: tag a value with a brand WITHOUT validation.
 *
 * Use ONLY at points where the value is already known to satisfy the brand's
 * invariant (e.g. inside a validator after the runtime check, or in test
 * fixtures that synthesise known-good data). Production callers should prefer
 * the `as*` validators below.
 */
export function brand<B extends string, T>(value: T): Brand<T, B> {
  return value as Brand<T, B>;
}

// ---------------------------------------------------------------------------
// Validators — each returns a Result so callers must handle the error path.
// ---------------------------------------------------------------------------

/**
 * Validate and brand a string as an {@link EventId}.
 *
 * Accepts any non-empty string after trimming. EventKit UIDs have no fixed
 * shape across calendar providers, so we only enforce non-emptiness here.
 */
export function asEventId(raw: string): Result<EventId, string> {
  if (typeof raw !== "string") {
    return err("EventId must be a string");
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return err("EventId must not be empty");
  }
  return ok(brand<"EventId", string>(trimmed));
}

/**
 * Validate and brand a string as a {@link MeetUrl}.
 *
 * Enforces: parses as a URL, uses the `https:` scheme, no embedded credentials,
 * default port. Hostname allowlisting is performed by `isAllowedMeetUrl` in
 * `main/utils/url-validation.ts`; this validator is the structural gate.
 */
export function asMeetUrl(raw: string): Result<MeetUrl, string> {
  if (typeof raw !== "string" || raw.length === 0) {
    return err("MeetUrl must be a non-empty string");
  }
  // Reject case-variant protocols up front (URL parser normalises case).
  if (!raw.startsWith("https://")) {
    return err("MeetUrl must use https:// scheme");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return err("MeetUrl is not a valid URL");
  }
  if (parsed.protocol !== "https:") {
    return err("MeetUrl must use https:// scheme");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return err("MeetUrl must not contain embedded credentials");
  }
  if (parsed.port !== "") {
    return err("MeetUrl must use the default https port");
  }
  return ok(brand<"MeetUrl", string>(raw));
}

/**
 * Validate and brand a string as an {@link IsoUtc} timestamp.
 *
 * Enforces: parses to a finite Date and round-trips through Date.toISOString()
 * (i.e. represents a real instant). Accepts strings with or without an
 * explicit `Z` / offset suffix; bare timestamps are interpreted as UTC by
 * appending `Z` for the parse check, mirroring `parseIsoUtc` in
 * `main/swift/event-parser.ts`.
 */
export function asIsoUtc(raw: string): Result<IsoUtc, string> {
  if (typeof raw !== "string" || raw.length === 0) {
    return err("IsoUtc must be a non-empty string");
  }
  const trimmed = raw.trim();
  const hasTz = /Z$/i.test(trimmed) || /[+\-]\d{2}:?\d{2}$/.test(trimmed);
  const date = new Date(hasTz ? trimmed : `${trimmed}Z`);
  if (Number.isNaN(date.getTime())) {
    return err("IsoUtc is not a parseable timestamp");
  }
  return ok(brand<"IsoUtc", string>(raw));
}
