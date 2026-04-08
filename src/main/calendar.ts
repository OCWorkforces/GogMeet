import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  CalendarPermission,
  CalendarResult,
} from "../shared/models.js";
import { runSwiftHelper } from "./swift/binary-manager.js";
import { parseEvents } from "./swift/event-parser.js";

export { cleanDescription, parseEvents } from "./swift/event-parser.js";

const execFileAsync = promisify(execFile);

/** Fetch Google Meet events — returns structured result with events or error */
export async function getCalendarEventsResult(): Promise<CalendarResult> {
  try {
    const output = await runSwiftHelper();
    return { events: parseEvents(output) };
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim();
    const message =
      stderr || (err instanceof Error ? err.message : "Unknown error");
    console.error("[calendar] getCalendarEventsResult error:", err);
    return { error: message };
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
  try {
    await runAppleScript(`
      tell application "Calendar"
        get name of first calendar
      end tell
    `);
    return "granted";
  } catch (err) {
    const msg = String(err);
    if (msg.includes("not authorized") || msg.includes("1743")) {
      return "denied";
    }
    if (msg.includes("2700") || msg.includes("not determined")) {
      return "not-determined";
    }
    return "not-determined";
  }
}
