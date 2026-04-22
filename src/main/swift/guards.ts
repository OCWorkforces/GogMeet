/** Runtime type guards used by Swift helper integration.
 *
 * These replace unchecked `as` type assertions with verifiable narrowing so the
 * type system reflects what the runtime can actually prove. */

/** Shape of an error from `child_process.execFile` or `runSwiftHelper`. All
 * fields are optional because Node assigns them dynamically on the Error. */
export interface ExecErrorLike {
  readonly code?: number | string;
  readonly stderr?: unknown;
  readonly message?: unknown;
}

/** True when `value` is a non-null object — narrows safely from `unknown`. */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True when `value` looks like an exec/spawn error.
 *
 * Conservative: any non-null object qualifies because Node may attach
 * `code`/`stderr`/`message` lazily. Field access still validates each field
 * via `typeof`. */
export function isExecErrorLike(value: unknown): value is ExecErrorLike {
  return isObjectRecord(value);
}

/** Read `.stderr` from an unknown error, returning a trimmed non-empty string
 * or `undefined`. Replaces `(err as { stderr?: string }).stderr?.trim()`. */
export function getErrorStderr(err: unknown): string | undefined {
  if (!isExecErrorLike(err)) return undefined;
  if (typeof err.stderr !== "string") return undefined;
  const trimmed = err.stderr.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Build a tuple type `[string, string, …]` of length `N`. */
type BuildStringTuple<
  N extends number,
  Acc extends string[] = [],
> = Acc["length"] extends N ? Acc : BuildStringTuple<N, [...Acc, string]>;

/** Fixed-length tuple of `N` strings. */
export type StringTuple<N extends number> = BuildStringTuple<N>;

/** True when `arr` is a string-only array of exactly `length` elements.
 *
 * Narrows `readonly string[]` to a fixed-length tuple `StringTuple<N>` so
 * destructuring N elements yields `string` (not `string | undefined`) under
 * `noUncheckedIndexedAccess`. */
export function isStringTupleOfLength<N extends number>(
  arr: readonly string[],
  length: N,
): arr is StringTuple<N> {
  return arr.length === length;
}
