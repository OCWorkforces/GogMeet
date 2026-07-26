import { shell } from "electron";
import type { MeetingEvent } from "../../shared/meeting-event.js";
import type { Result } from "../../shared/result.js";
import { err, ok } from "../../shared/result.js";
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
  const identity = (() => {
    switch (platform) {
      case "google-meet":
        return { name: "authuser", value: email };
      case "zoom":
        return { name: "uname", value: email };
      default:
        return null;
    }
  })();

  if (!identity) return base;

  const parsed = new URL(base);
  parsed.searchParams.set(identity.name, identity.value);
  return parsed.toString();
}

/**
 * Validate and open a meeting URL in the default browser.
 * Returns a Result so callers can surface failures; never throws.
 */
export async function openMeetingUrl(url: string): Promise<Result<void, string>> {
  if (!isAllowedMeetUrl(url)) {
    console.error("[meet-url] Blocked disallowed URL:", url);
    return err("MeetUrl hostname is not in the allowlist");
  }
  try {
    await shell.openExternal(url);
    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[meet-url] Failed to open URL:", url, e);
    return err(message);
  }
}
