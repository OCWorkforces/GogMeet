import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { formatAppError } from "../../shared/errors.js";
import type { CalendarPermission, CalendarResult } from "../../shared/calendar-result.js";
import { runSwiftHelper } from "../swift/binary-manager.js";
import { parseEvents } from "../swift/event-parser.js";
import { SwiftHelperError } from "../swift/event-validator.js";
import { getErrorStderr } from "../swift/guards.js";

const execFileAsync = promisify(execFile);

let cachedPermissionStatus: CalendarPermission | null = null;

/** Fetch Google Meet events — returns structured result with events or error */
export async function getCalendarEventsResult(): Promise<CalendarResult> {
  try {
    const output = await runSwiftHelper();
    const { events, diagnostics } = parseEvents(output);
    for (const d of diagnostics) {
      console.warn(`[calendar] Parse diagnostic: line ${d.line}: ${d.reason}`);
    }
    return { kind: "ok", events: [...events] };
  } catch (err) {
    if (err instanceof SwiftHelperError) {
      const appErr = err.toAppError();
      console.error("[calendar] getCalendarEventsResult error:", err);
      return { kind: "err", error: formatAppError(appErr) };
    }
    const stderr = getErrorStderr(err);
    const message = stderr || (err instanceof Error ? err.message : "Unknown error");
    console.error("[calendar] getCalendarEventsResult error:", err);
    return { kind: "err", error: message };
  }
}

/** Run an inline AppleScript for permission checks (fast, no event queries) */
async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await execFileAsync("osascript", ["-e", script], {
    timeout: 10_000,
  });
  return stdout.trim();
}

/** Trigger permission dialog by accessing Calendar */
export async function requestCalendarPermission(): Promise<CalendarPermission> {
  try {
    await runAppleScript(`
      tell application "Calendar"
        get name of calendars
      end tell
    `);
    return "granted";
  } catch {
    return "denied";
  }
}

/** Check current calendar permission state without triggering dialog */
export async function getCalendarPermissionStatus(): Promise<CalendarPermission> {
  if (cachedPermissionStatus !== null) return cachedPermissionStatus;
  try {
    await runAppleScript(`
      tell application "Calendar"
        get name of first calendar
      end tell
    `);
    cachedPermissionStatus = "granted";
    return cachedPermissionStatus;
  } catch (err) {
    const msg = String(err);
    if (msg.includes("not authorized") || msg.includes("1743")) {
      cachedPermissionStatus = "denied";
      return cachedPermissionStatus;
    }
    if (msg.includes("2700") || msg.includes("not determined")) {
      cachedPermissionStatus = "not-determined";
      return cachedPermissionStatus;
    }
    cachedPermissionStatus = "not-determined";
    return cachedPermissionStatus;
  }
}

/** Invalidate cached permission — call on power state resume as a safety net */
export function invalidateCalendarPermissionCache(): void {
  cachedPermissionStatus = null;
}
