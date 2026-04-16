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
