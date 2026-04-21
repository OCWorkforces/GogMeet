/** Allowlisted Meet URL prefixes (preserved for backward-compatible exports) */
export const MEET_URL_ALLOWLIST = [
  "https://meet.google.com/",
  "https://calendar.google.com/",
  "https://accounts.google.com/",
] as const;

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
  if (typeof url !== "string" || url.length === 0) return false;

  // Reject case-variant protocols up front (URL parser normalises case,
  // which would otherwise silently accept "HTTPS://...").
  if (!url.startsWith("https://")) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  // Reject embedded credentials: https://evil@meet.google.com/
  if (parsed.username !== "" || parsed.password !== "") return false;
  // Reject non-default ports (https default port serialises as empty string).
  if (parsed.port !== "") return false;

  return ALLOWED_HOSTNAMES.includes(parsed.hostname);
}
