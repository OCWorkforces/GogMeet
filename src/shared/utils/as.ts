/**
 * Concise unchecked casts (replaces `as unknown as T`).
 *
 * Prefer type guards and branded constructors at trust boundaries.
 *
 * Method form (objects / boxed values) — tests / non-bundled contexts:
 *   value.As<TargetType>()
 *
 * Free function (any value, including null / undefined) — **prefer in production
 * main/preload code** that is bundled by Rslib/Rspack:
 *   As<TargetType>(value)
 *
 * Why free function in production: package side-effects + minification can drop
 * a bare `import ".../as.js"` that only installs `Object.prototype.As`, leaving
 * `value.As()` as a runtime TypeError (e.g. `spawn(...).As is not a function`).
 * A named `import { As }` keeps the module and does not depend on the prototype.
 *
 * Vitest installs the prototype via `tests/setup.as.ts`. Import this module for
 * the free function or for side effects where method form is intentional:
 *   import { As } from "../../shared/utils/as.js";
 *   import "../../shared/utils/as.js";
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
