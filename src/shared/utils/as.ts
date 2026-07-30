/**
 * Concise unchecked casts (replaces `as unknown as T`).
 *
 * Prefer type guards and branded constructors at trust boundaries.
 *
 * Method form (objects / boxed values):
 *   value.As<TargetType>()
 *
 * Free function (null / undefined / any value):
 *   As<TargetType>(value)
 *
 * Import this module once for side effects so the prototype method is installed:
 *   import "../../shared/utils/as.js";
 *   import { As } from "../../shared/utils/as.js";
 */

declare global {
  interface Object {
    /**
     * Unchecked cast equivalent to `this as unknown as T`.
     * Not available on `null` / `undefined` (use free-function {@link As}).
     */
    As<T>(this: unknown): T;
  }
}

const AS_KEY = "As";

if (!Object.prototype.hasOwnProperty.call(Object.prototype, AS_KEY)) {
  Object.defineProperty(Object.prototype, AS_KEY, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: function ObjectAs<T>(this: unknown): T {
      return this as T;
    },
  });
}

/**
 * Free-function cast for any value, including `null` / `undefined`.
 * Prefer `value.As<T>()` when the receiver is a non-null object.
 */
export function As<T>(value: unknown): T {
  return value as T;
}
