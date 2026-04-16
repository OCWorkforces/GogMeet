import { shell } from "electron";
import type { MeetingEvent } from "../../shared/models.js";
import { isAllowedMeetUrl } from "./url-validation.js";

/**
 * Build the URL to open for a meeting.
 * Appends ?authuser=email if we have a Google email for the user.
 * Returns empty string if URL is not an allowed Google Meet domain.
 */
export function buildMeetUrl(event: MeetingEvent): string {
  if (!event.meetUrl) return "";

  const base = event.meetUrl.startsWith("https://")
    ? event.meetUrl
    : `https://${event.meetUrl}`;

  // Validate URL is from an allowed Google domain
  if (!isAllowedMeetUrl(base)) return "";

  const email = event.userEmail?.trim();
  if (email && email.includes("@")) {
    return `${base}?authuser=${encodeURIComponent(email)}`;
  }
  return base;
}

/**
 * Validate and open a Google Meet URL in the default browser.
 * Logs errors on failure.
 */
export async function openMeetingUrl(url: string): Promise<void> {
  if (!isAllowedMeetUrl(url)) {
    console.error("[meet-url] Blocked disallowed URL:", url);
    return;
  }
  await shell.openExternal(url).catch((err) => {
    console.error("[meet-url] Failed to open URL:", url, err);
  });
}
