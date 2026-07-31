/**
 * Code-point-aware middle truncation for display labels.
 *
 * Preserves the start and end of a string when the total display budget is tight
 * (e.g. popover meeting titles). Does not mutate stored event titles.
 */

/** Default max display length for meeting titles (includes ellipsis). */
export const MEETING_TITLE_DISPLAY_MAX_CHARS = 25 as const;

/** Default ellipsis token (single code point; matches tray-style U+2026). */
export const MIDDLE_TRUNCATE_ELLIPSIS = "\u2026" as const;

/**
 * Truncate `text` to at most `maxChars` code points by removing the middle.
 *
 * When truncation is needed: `head + ellipsis + tail`, where head is slightly
 * longer than tail if the remaining budget is odd (`Math.ceil` / `Math.floor`).
 *
 * @param text - Source string (not HTML-escaped; callers escape after truncate)
 * @param maxChars - Total budget including the ellipsis (default 25)
 * @param ellipsis - Replacement for the removed middle (default `…`)
 */
export function truncateMiddle(
  text: string,
  maxChars: number = MEETING_TITLE_DISPLAY_MAX_CHARS,
  ellipsis: string = MIDDLE_TRUNCATE_ELLIPSIS,
): string {
  if (maxChars <= 0) return "";
  if (text.length === 0) return "";

  const cps = Array.from(text);
  if (cps.length <= maxChars) return text;

  const ellipsisCps = Array.from(ellipsis);
  const ellipsisLen = ellipsisCps.length;

  if (ellipsisLen === 0) {
    // No ellipsis marker: keep a prefix only (degenerate call site).
    return cps.slice(0, maxChars).join("");
  }

  if (maxChars <= ellipsisLen) {
    return ellipsisCps.slice(0, maxChars).join("");
  }

  const budget = maxChars - ellipsisLen;
  const headLen = Math.ceil(budget / 2);
  const tailLen = Math.floor(budget / 2);

  return cps.slice(0, headLen).join("") + ellipsis + cps.slice(cps.length - tailLen).join("");
}
