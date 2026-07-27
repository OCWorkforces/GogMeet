/**
 * Generic runtime type guards used across main/shared code.
 * Keep free of Electron and Swift-helper concerns.
 */

/** True when `value` is a non-null object — narrows safely from `unknown`. */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
