import type { Result } from "../../domain/entities/result.js";
import { createShellMeetingOpener } from "../infrastructure/electron/shell-meeting-opener.js";

const defaultOpener = createShellMeetingOpener();

/**
 * Validate and open a meeting URL in the default browser.
 * Returns a Result so callers can surface failures; never throws.
 *
 * Pure URL construction: {@link buildMeetUrl} in `domain/services/build-meet-url.ts`.
 * Prefer `createShellMeetingOpener` from infrastructure for new composition wiring.
 */
export async function openMeetingUrl(url: string): Promise<Result<void, string>> {
  return defaultOpener.open(url);
}
