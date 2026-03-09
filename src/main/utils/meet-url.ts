import type { MeetingEvent } from "../../shared/types.js";

/**
 * Build the URL to open for a meeting.
 * Appends ?authuser=email if we have a Google email for the user.
 */
export function buildMeetUrl(event: MeetingEvent): string {
  const base = (event.meetUrl ?? "").startsWith("https://")
    ? event.meetUrl!
    : `https://${event.meetUrl}`;

  const email = event.userEmail?.trim();
  if (email && email.includes("@")) {
    return `${base}?authuser=${encodeURIComponent(email)}`;
  }
  return base;
}
