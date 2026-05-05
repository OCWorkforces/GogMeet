/**
 * DOM helpers shared across renderer entry points.
 *
 * - `queryRequiredElement` looks up an element by id and verifies it is the
 *   expected constructor type, warning when the tag does not match.
 * - `isElementTarget` narrows an `EventTarget | null` to `Element` so callers
 *   can invoke Element-only APIs (e.g. `.closest`) without unsafe casts.
 */

export function queryRequiredElement<T extends Element>(
  id: string,
  ctor: new () => T,
): T | null {
  const el = document.getElementById(id);
  if (el === null) return null;
  if (el instanceof ctor) return el;
  console.warn(
    `[dom] queryRequiredElement: #${id} is not an instance of ${ctor.name}`,
  );
  return null;
}

export function isElementTarget(
  target: EventTarget | null,
): target is Element {
  return target instanceof Element;
}
