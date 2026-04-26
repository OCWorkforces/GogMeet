/**
 * Generic Result<T,E> for fallible operations across the codebase.
 *
 * Use this for: settings I/O (loadSettings/saveSettings), brand validators
 * (asEventId, asMeetUrl, asIsoUtc), and any new operation where failure is a
 * plain string or simple typed error.
 *
 * NOT to be confused with `CalendarResult` in models.ts. CalendarResult is a
 * separate, intentionally divergent shape (`kind: "ok"|"err"` plus an
 * `isCalendarOk()` guard) that carries Swift EventKit-specific semantics. It
 * exists because calendar fetches map to discrete exit codes (permission-denied,
 * no-calendars, error, timeout) that drive specific user-facing UI, and the
 * domain shape predates this generic type.
 *
 * Guidance: prefer Result<T,E> for new fallible code. Only mirror the
 * CalendarResult pattern when modeling another external subsystem with its own
 * enumerated failure modes that the UI must distinguish.
 */

/**
 * Discriminated union for type-safe error handling.
 *
 * @example
 * ```ts
 * const result: Result<number> = ok(42);
 * const err: Result<number> = err("something went wrong");
 *
 * if (result.ok) {
 *   console.log(result.value); // number
 * } else {
 *   console.error(result.error); // string
 * }
 * ```
 */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
