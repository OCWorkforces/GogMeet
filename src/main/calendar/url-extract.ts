/**
 * Extract meeting join URLs from free-text calendar fields.
 *
 * Priority matches the Swift EventKit helper (`googlemeet-events.swift`):
 *   Zoom → Google Meet → Calendly
 *
 * Within a multi-field search, earlier arguments win (e.g. hangoutLink before
 * location before description), matching Swift's `url ?? location ?? notes`.
 */

import { isAllowedMeetUrl } from "../utils/url-validation.js";

/** Zoom (apex or subdomain). Mirrors Swift: `https://(?:[a-zA-Z0-9-]+\.)*zoom\.us/...` */
const ZOOM_URL_RE = /https:\/\/(?:[a-zA-Z0-9-]+\.)*zoom\.us\/[^\s"'<>\\]+/i;

/** Google Meet. Mirrors Swift: `https://meet\.google\.com/...` */
const MEET_URL_RE = /https:\/\/meet\.google\.com\/[^\s"'<>\\]+/i;

/** Calendly wrapper. Mirrors Swift: `https://calendly\.com/...` */
const CALENDLY_URL_RE = /https:\/\/calendly\.com\/[^\s"'<>\\]+/i;

/** Strip common trailing punctuation that is not part of the URL path. */
function trimTrailingJunk(url: string): string {
  return url.replace(/[.,;:!?)]+$/u, "");
}

/**
 * Find the first meeting URL in a single text blob (Zoom → Meet → Calendly).
 * Returns undefined when no allowlisted match is found.
 */
export function extractMeetingUrlFromText(text: string | undefined): string | undefined {
  if (text === undefined || text.length === 0) return undefined;

  const candidates: readonly RegExp[] = [ZOOM_URL_RE, MEET_URL_RE, CALENDLY_URL_RE];
  for (const re of candidates) {
    const match = re.exec(text);
    if (match?.[0] === undefined) continue;
    const candidate = trimTrailingJunk(match[0]);
    if (isAllowedMeetUrl(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Search multiple free-text fields in order (first non-empty match wins).
 *
 * Typical Google Calendar usage:
 *   extractMeetingUrl(hangoutLink, ...entryPoints, location, description)
 *
 * Typical EventKit-equivalent usage:
 *   extractMeetingUrl(eventUrl, location, notes)
 */
export function extractMeetingUrl(...texts: Array<string | undefined>): string | undefined {
  for (const text of texts) {
    const found = extractMeetingUrlFromText(text);
    if (found !== undefined) return found;
  }
  return undefined;
}
