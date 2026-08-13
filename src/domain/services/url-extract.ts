/**
 * Extract meeting join URLs from free-text calendar fields.
 *
 * Priority matches the Swift EventKit helper (`googlemeet-events.swift`):
 *   Zoom → Google Meet → Teams → Webex → Calendly
 *
 * Within a multi-field search, earlier arguments win (e.g. hangoutLink before
 * location before description), matching Swift's `url ?? location ?? notes`.
 */

import { isAllowedMeetUrl } from "./url-validation.js";

/** Zoom (apex or subdomain). Mirrors Swift: `https://(?:[a-zA-Z0-9-]+\.)*zoom\.us/...` */
const ZOOM_URL_RE = /https:\/\/(?:[a-zA-Z0-9-]+\.)*zoom\.us\/[^\s"'<>\\]+/i;

/** Google Meet. Mirrors Swift: `https://meet\.google\.com/...` */
const MEET_URL_RE = /https:\/\/meet\.google\.com\/[^\s"'<>\\]+/i;

/** Microsoft Teams. */
const TEAMS_URL_RE = /https:\/\/(?:teams\.microsoft\.com|teams\.live\.com)\/[^\s"'<>\\]+/i;

/** Webex (apex or subdomain). */
const WEBEX_URL_RE = /https:\/\/(?:[a-zA-Z0-9-]+\.)*webex\.com\/[^\s"'<>\\]+/i;

/** Calendly wrapper. Mirrors Swift: `https://calendly\.com/...` */
const CALENDLY_URL_RE = /https:\/\/calendly\.com\/[^\s"'<>\\]+/i;

/** href="..." capture for HTML descriptions (clean-before-extract would drop these). */
const HREF_URL_RE = /href\s*=\s*["'](https:\/\/[^"']+)["']/i;

/** Scheme-less host paths that still identify a join link. */
const BARE_HOST_RE =
  /(?:^|[\s"'<>(])((?:(?:[a-zA-Z0-9-]+\.)*zoom\.us|meet\.google\.com|calendly\.com|teams\.microsoft\.com|teams\.live\.com|(?:[a-zA-Z0-9-]+\.)*webex\.com)\/[^\s"'<>\\]+)/i;

/** Strip common trailing punctuation that is not part of the URL path. */
function trimTrailingJunk(url: string): string {
  return url.replace(/[.,;:!?)]+$/u, "");
}

function tryCandidate(raw: string): string | undefined {
  const candidate = trimTrailingJunk(raw);
  if (isAllowedMeetUrl(candidate)) return candidate;
  return undefined;
}

/**
 * Find the first meeting URL in a single text blob.
 * Returns undefined when no allowlisted match is found.
 */
export function extractMeetingUrlFromText(text: string | undefined): string | undefined {
  if (text === undefined || text.length === 0) return undefined;

  // Prefer explicit https matches (Zoom → Meet → Teams → Webex → Calendly).
  const candidates: readonly RegExp[] = [
    ZOOM_URL_RE,
    MEET_URL_RE,
    TEAMS_URL_RE,
    WEBEX_URL_RE,
    CALENDLY_URL_RE,
  ];
  for (const re of candidates) {
    const match = re.exec(text);
    if (match?.[0] === undefined) continue;
    const found = tryCandidate(match[0]);
    if (found !== undefined) return found;
  }

  // HTML descriptions often keep the join URL only in href attributes.
  const href = HREF_URL_RE.exec(text);
  if (href?.[1] !== undefined) {
    const found = tryCandidate(href[1]);
    if (found !== undefined) return found;
  }

  // Bare host paths (no scheme) from pasted locations/notes.
  const bare = BARE_HOST_RE.exec(text);
  if (bare?.[1] !== undefined) {
    const found = tryCandidate(`https://${bare[1]}`);
    if (found !== undefined) return found;
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
