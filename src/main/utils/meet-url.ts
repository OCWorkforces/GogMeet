import type { Result } from "../../domain/entities/result.js";
import type { MeetingOpenerPort } from "../application/ports/meeting-opener-port.js";
import { createShellMeetingOpener } from "../infrastructure/electron/shell-meeting-opener.js";

let boundOpener: MeetingOpenerPort = createShellMeetingOpener();

/** Composition: share one opener instance for IPC, join, and auto-open. */
export function bindMeetingOpener(opener: MeetingOpenerPort): void {
  boundOpener = opener;
}

export function rebindMeetingOpenerDefaults(): void {
  boundOpener = createShellMeetingOpener();
}

/**
 * Validate and open a meeting URL in the default browser.
 * Returns a Result so callers can surface failures; never throws.
 *
 * Pure URL construction: {@link buildMeetUrl} in `domain/services/build-meet-url.ts`.
 * Prefer graph.opener / bindMeetingOpener for composition; this free-fn delegates
 * to the bound port after bindComposition/createAppGraph.
 */
export async function openMeetingUrl(url: string): Promise<Result<void, string>> {
  return boundOpener.open(url);
}
