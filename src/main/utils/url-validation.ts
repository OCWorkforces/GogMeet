import type { MeetUrl } from "../../shared/brand.js";
import { asMeetUrl } from "../../shared/brand.js";
import type { Result } from "../../shared/result.js";
import { err, ok } from "../../shared/result.js";

/** Allowlisted meeting URL prefixes for exact hostname matching. */
export const MEETING_URL_ALLOWLIST: readonly string[] = [
  "https://meet.google.com/",
  "https://calendar.google.com/",
  "https://accounts.google.com/",
  "https://zoom.us/",
  "https://calendly.com/",
] as const;


/**
 * Hostname suffixes that allow any subdomain.
 * e.g. ".zoom.us" accepts "acme.zoom.us", "us02web.zoom.us", etc.
 */
const ALLOWED_HOSTNAME_SUFFIXES: readonly string[] = [
  ".zoom.us",
] as const;

/** Hostnames derived from the allowlist for strict, parser-based matching. */
const ALLOWED_HOSTNAMES: readonly string[] = MEETING_URL_ALLOWLIST.map((prefix) => {
  return new URL(prefix).hostname;
});

/**
 * Returns true if the URL is a valid https:// URL whose hostname passes
 * the allowlist check (exact match or allowed subdomain suffix). Defends against:
 * - Prefix-match spoofing (e.g. https://meet.google.com.evil.com)
 * - Userinfo injection (e.g. https://evil@meet.google.com)
 * - Non-standard ports
 * - Non-https schemes (http, data, javascript, file, etc.)
 */

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
  if (isAllowedHostname(parsed.hostname)) {
    return ok(branded.value);
  }
  return err("MeetUrl hostname is not in the allowlist");
}

/**
 * Returns true if the URL is a valid https:// URL whose hostname passes
 * the allowlist check (exact match or allowed subdomain suffix).
 */
export function isAllowedMeetUrl(url: string): boolean {
  return validateMeetUrl(url).ok;
}

/**
 * Check if a hostname matches the allowlist:
 * - Exact match against ALLOWED_HOSTNAMES (meet.google.com, zoom.us, etc.)
 * - Suffix match against ALLOWED_HOSTNAME_SUFFIXES (.zoom.us → acme.zoom.us)
 */
function isAllowedHostname(hostname: string): boolean {
  if (ALLOWED_HOSTNAMES.includes(hostname)) return true;
  for (const suffix of ALLOWED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) return true;
  }
  return false;
}
