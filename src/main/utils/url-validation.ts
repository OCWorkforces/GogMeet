import type { MeetUrl } from "../../shared/brand.js";
import { asMeetUrl } from "../../shared/brand.js";
import type { Result } from "../../shared/result.js";
import { err, ok } from "../../shared/result.js";

/** Allowlisted Meet URL prefixes (preserved for backward-compatible exports) */
export const MEET_URL_ALLOWLIST = [
  "https://meet.google.com/",
  "https://calendar.google.com/",
  "https://accounts.google.com/",
] as const satisfies readonly string[];

/** Hostnames derived from the allowlist for strict, parser-based matching. */
const ALLOWED_HOSTNAMES: readonly string[] = MEET_URL_ALLOWLIST.map((prefix) => {
  // Safe: prefixes are static literals validated above
  return new URL(prefix).hostname;
});

/**
 * Returns true if the URL is a valid https:// URL whose hostname exactly
 * matches an entry in the allowlist. Defends against:
 * - Prefix-match spoofing (e.g. https://meet.google.com.evil.com)
 * - Userinfo injection (e.g. https://evil@meet.google.com)
 * - Non-standard ports
 * - Non-https schemes (http, data, javascript, file, etc.)
 */
export function isAllowedMeetUrl(url: string): boolean {
  return validateMeetUrl(url).ok;
}

/**
 * Structural + allowlist validator that returns a branded {@link MeetUrl} on
 * success. Used at trust boundaries (Swift parser ingress, IPC handlers) so
 * the rest of the system can rely on the brand to know a URL has already
 * cleared every check enforced here.
 */
export function validateMeetUrl(url: string): Result<MeetUrl, string> {
  const branded = asMeetUrl(url);
  if (!branded.ok) return branded;
  // asMeetUrl already enforced https://, no credentials, default port.
  // We only need the hostname-allowlist check here.
  const parsed = new URL(branded.value);
  if (!ALLOWED_HOSTNAMES.includes(parsed.hostname)) {
    return err("MeetUrl hostname is not in the allowlist");
  }
  return ok(branded.value);
}
