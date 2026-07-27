import { shell } from "electron";
import type { Result } from "../../../domain/entities/result.js";
import { err, ok } from "../../../domain/entities/result.js";
import { isAllowedMeetUrl } from "../../../domain/services/url-validation.js";
import type { MeetingOpenerPort } from "../../application/ports/meeting-opener-port.js";

/**
 * Allowlisted meeting URL egress via shell.openExternal.
 */
export function createShellMeetingOpener(): MeetingOpenerPort {
  return {
    async open(url: string): Promise<Result<void, string>> {
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
    },
  };
}
