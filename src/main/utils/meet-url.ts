import { shell } from "electron";
import type { Result } from "../../domain/entities/result.js";
import { err, ok } from "../../domain/entities/result.js";
import { isAllowedMeetUrl } from "../../domain/services/url-validation.js";

/**
 * Validate and open a meeting URL in the default browser.
 * Returns a Result so callers can surface failures; never throws.
 *
 * Pure URL construction: {@link buildMeetUrl} in `domain/services/build-meet-url.ts`.
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
