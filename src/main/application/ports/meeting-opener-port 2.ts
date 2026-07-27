import type { Result } from "../../../domain/entities/result.js";

/** Allowlisted meeting URL egress (shell.openExternal). */
export interface MeetingOpenerPort {
  open(url: string): Promise<Result<void, string>>;
}
