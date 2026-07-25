/** Exact hostnames permitted for meeting URL egress / branding. */
export const MEET_URL_ALLOWED_HOSTNAMES: readonly string[] = [
  "meet.google.com",
  "calendar.google.com",
  "accounts.google.com",
  "zoom.us",
  "calendly.com",
] as const;

/** Hostname suffixes that allow any subdomain (e.g. us02web.zoom.us). */
export const MEET_URL_ALLOWED_HOSTNAME_SUFFIXES: readonly string[] = [".zoom.us"] as const;

export function isAllowedMeetHostname(hostname: string): boolean {
  if (MEET_URL_ALLOWED_HOSTNAMES.includes(hostname)) return true;
  for (const suffix of MEET_URL_ALLOWED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) return true;
  }
  return false;
}
