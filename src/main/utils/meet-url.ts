import { shell } from "electron";
import type { MeetingEvent } from "../../shared/meeting-event.js";
import { isAllowedMeetUrl } from "./url-validation.js";
import { detectPlatform } from "./platform.js";

/**
 * Build the URL to open for a meeting, with platform-specific identity parameters.
 * - Google Meet: appends `?authuser=email`
 * - Zoom: appends `?uname=email` (pre-fills display name in join screen)
 * - Unknown platform: returns base URL as-is
 * Returns empty string if URL is not allowed or has no URL.
 */
export function buildMeetUrl(event: MeetingEvent): string {
  if (!event.meetUrl) return "";

  const base = event.meetUrl.startsWith("https://") ? event.meetUrl : `https://${event.meetUrl}`;

  // Validate URL is from an allowed domain
  if (!isAllowedMeetUrl(base)) return "";

  const email = event.userEmail?.trim();
  if (!email || !email.includes("@")) return base;

  const platform = detectPlatform(base);
  const param = (() => {
    switch (platform) {
      case "google-meet":
        return `authuser=${encodeURIComponent(email)}`;
      case "zoom":
        return `uname=${encodeURIComponent(email)}`;
      default:
        return null;
    }
  })();

  if (!param) return base;

  // Preserve existing query parameters: use & if URL already contains ?
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${param}`;
}

/**
 * Validate and open a meeting URL in the default browser.
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
