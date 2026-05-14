/**
 * Meeting platform detection utility.
 *
 * Given a meeting URL, determines whether it belongs to Google Meet or Zoom.
 * Hostname matching follows the same allowlist logic as url-validation.ts.
 */

/** Supported meeting platforms. */
export type MeetingPlatform = "google-meet" | "zoom";

/** Google Meet hostnames (exact match — from MEETING_URL_ALLOWLIST). */
const GOOGLE_HOSTNAMES = new Set(["meet.google.com", "calendar.google.com", "accounts.google.com"]);

/** Zoom hostname suffix for wildcard subdomain matching. */
const ZOOM_HOSTNAME_SUFFIX = ".zoom.us";

/** Zoom apex hostname (no subdomain). */
const ZOOM_APEX_HOSTNAME = "zoom.us";

/**
 * Detect the meeting platform from a URL.
 *
 * @returns The detected platform, or `undefined` if the URL doesn't match
 *          any known meeting platform.
 */
export function detectPlatform(url: string): MeetingPlatform | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const hostname = parsed.hostname;

  // Google Meet: exact hostname match
  if (GOOGLE_HOSTNAMES.has(hostname)) {
    return "google-meet";
  }

  // Zoom: apex or wildcard subdomain
  if (hostname === ZOOM_APEX_HOSTNAME || hostname.endsWith(ZOOM_HOSTNAME_SUFFIX)) {
    return "zoom";
  }

  return undefined;
}
