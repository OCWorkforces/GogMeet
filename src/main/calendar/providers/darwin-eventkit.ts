import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { formatAppError } from "../../../domain/entities/errors.js";
import type {
  CalendarErrorCode,
  CalendarPermission,
  CalendarResult,
} from "../../../domain/entities/calendar-result.js";
import { ensureBinary, runSwiftHelper } from "../../swift/binary-manager.js";
import {
  reviveWatchSidecar,
  startWatchSidecar,
  stopWatchSidecar,
} from "../../swift/calendar-watch-sidecar.js";
import { aggregateParseDiagnostics, parseEvents } from "../../swift/event-parser.js";
import { SwiftHelperError } from "../../swift/event-validator.js";
import { getErrorStderr } from "../../swift/guards.js";
import type { CalendarProvider } from "../provider.js";

const execFileAsync = promisify(execFile);

/** Run an inline AppleScript for permission checks (fast, no event queries). */
async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await execFileAsync("osascript", ["-e", script], {
    timeout: 10_000,
  });
  return stdout.trim();
}

/**
 * macOS EventKit calendar provider (Swift helper + AppleScript permission probes).
 * Only loaded on Darwin via the factory dynamic import path.
 */

function calendarErrorCodeFromSwift(err: SwiftHelperError): CalendarErrorCode {
  const appErr = err.toAppError();
  if (appErr.kind === "calendar-permission-denied") return "permission-denied";
  if (appErr.kind === "calendar-no-calendars") return "no-calendars";
  if (appErr.kind === "calendar-runtime") return "runtime";
  return "unknown";
}

export function createDarwinEventKitProvider(): CalendarProvider {
  return {
    id: "darwin-eventkit",

    async getEvents(signal: AbortSignal): Promise<CalendarResult> {
      try {
        const output = await runSwiftHelper(signal);
        const { events, diagnostics } = parseEvents(output);
        const darwinPartialRefreshDiagnostics = aggregateParseDiagnostics(diagnostics);
        // Any record diagnostic makes the live result partial (not silent drop of the fetch).
        const completeness = darwinPartialRefreshDiagnostics.total > 0 ? "partial" : "complete";
        if (darwinPartialRefreshDiagnostics.total > 0) {
          console.warn(darwinPartialRefreshDiagnostics);
        }
        return {
          kind: "ok",
          source: "live",
          completeness,
          observedAt: Date.now(),
          events: [...events],
          ...(darwinPartialRefreshDiagnostics.total > 0 ? { darwinPartialRefreshDiagnostics } : {}),
        };
      } catch (err) {
        if (err instanceof SwiftHelperError) {
          const appErr = err.toAppError();
          console.error("[calendar:darwin] getEvents error:", err);
          return {
            kind: "err",
            error: formatAppError(appErr),
            code: calendarErrorCodeFromSwift(err),
          };
        }
        const stderr = getErrorStderr(err);
        const message = stderr || (err instanceof Error ? err.message : "Unknown error");
        console.error("[calendar:darwin] getEvents error:", err);
        return { kind: "err", error: message, code: "unknown" };
      }
    },

    async requestPermission(): Promise<CalendarPermission> {
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
    },

    async getPermissionStatus(): Promise<CalendarPermission> {
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
    },

    startWatch(onChange: () => void): void {
      startWatchSidecar(onChange);
      console.log("[calendar:darwin] Watch sidecar started (EKEventStoreChangedNotification)");
    },

    stopWatch(): void {
      stopWatchSidecar();
      console.log("[calendar:darwin] Watch sidecar stopped");
    },

    reviveWatch(): void {
      reviveWatchSidecar();
    },

    async getAccountLabel(): Promise<string | null> {
      return null;
    },

    isOAuthConfigured(): boolean {
      return false;
    },

    isOAuthInFlight(): boolean {
      return false;
    },

    async warmup(): Promise<void> {
      await ensureBinary();
    },
  };
}
