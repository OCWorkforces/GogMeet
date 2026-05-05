import type { AppError } from "./errors.js";
import { err, type AppResult } from "./result.js";

/**
 * Parse a JSON string and validate that it decodes to a plain object,
 * then delegate to a validator for shape narrowing.
 *
 * @param raw - The raw JSON string.
 * @param field - The field name attached to any returned validation AppError.
 * @param validate - Callback that receives the parsed object and produces the typed AppResult<T>.
 */
export function parseJsonObject<T>(
  raw: string,
  field: string,
  validate: (value: Record<string, unknown>) => AppResult<T>,
): AppResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const error: AppError = { kind: "validation", field, message: `Invalid JSON: ${message}` };
    return err(error);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    const error: AppError = { kind: "validation", field, message: "Expected JSON object" };
    return err(error);
  }

  /**
   * Justified residual cast: the preceding `typeof === "object"`, `!== null`,
   * and `!Array.isArray` checks together establish that `parsed` is a plain
   * object, which is structurally a `Record<string, unknown>`. TypeScript
   * cannot narrow `unknown` to this shape without an explicit assertion.
   */
  const obj = parsed as Record<string, unknown>;
  return validate(obj);
}
