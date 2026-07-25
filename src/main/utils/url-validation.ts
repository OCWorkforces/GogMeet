import type { MeetUrl } from "../../shared/brand.js";
import { asMeetUrl } from "../../shared/brand.js";
import {
  isAllowedMeetHostname,
  MEET_URL_ALLOWED_HOSTNAMES,
} from "../../shared/meet-url-allowlist.js";
import type { Result } from "../../shared/result.js";
import { err, ok } from "../../shared/result.js";

/**
 * Legacy prefix form for tests/docs. Hostnames are the source of truth in
 * `src/shared/meet-url-allowlist.ts`.
 */
export const MEETING_URL_ALLOWLIST: readonly string[] = MEET_URL_ALLOWED_HOSTNAMES.map(
  (host) => `https://${host}/`,
);

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
  const parsed = new URL(branded.value);
  if (isAllowedMeetHostname(parsed.hostname)) {
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
