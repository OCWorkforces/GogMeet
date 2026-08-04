/**
 * Electron-owned atomic flush for the redacted performance trace buffer.
 * Fixed filename under app.getPath("userData") only — never caller/env paths.
 */

import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  buildProbeTerminalRecord,
  isPerfTraceEnabled,
  perfTraceToJsonl,
  _markTerminalFlushedForTests,
} from "./performance-trace.js";

/** Fixed published filename under isolated probe userData. */
export const PERF_TRACE_FILENAME = "gogmeet-perf-trace-v1.jsonl" as const;

let flushCompleted = false;
let beforeQuitRegistered = false;

/** Test-only reset for flush/idempotence state. */
export function _resetPerfTraceFileForTests(): void {
  flushCompleted = false;
  beforeQuitRegistered = false;
}

/**
 * Resolve the fixed absolute path for the published JSONL under userData.
 * Returns null when tracing is disabled or userData is unavailable.
 */
export function getPerfTraceFilePath(userDataPath: string): string | null {
  if (!isPerfTraceEnabled()) return null;
  if (typeof userDataPath !== "string" || userDataPath.length === 0) return null;
  const base = resolve(userDataPath);
  const target = resolve(base, PERF_TRACE_FILENAME);
  // Containment: published file must remain a direct child of userData.
  if (dirname(target) !== base) return null;
  if (!target.endsWith(PERF_TRACE_FILENAME)) return null;
  return target;
}

/**
 * Synchronously flush the in-memory buffer to a fixed JSONL under userData.
 * Temp file in the same directory → fsync/close → rename. Idempotent.
 * Never throws into product paths; on failure leaves no accepted partial final file.
 */
export function flushPerfTraceToUserData(userDataPath: string): {
  ok: boolean;
  path: string | null;
  reason?: string;
} {
  try {
    if (!isPerfTraceEnabled()) {
      return { ok: true, path: null, reason: "disabled" };
    }
    if (flushCompleted) {
      const path = getPerfTraceFilePath(userDataPath);
      return { ok: true, path, reason: "already-flushed" };
    }

    const target = getPerfTraceFilePath(userDataPath);
    if (target === null) {
      return { ok: false, path: null, reason: "invalid-path" };
    }

    const dir = resolve(userDataPath);
    const tempPath = join(dir, `.${PERF_TRACE_FILENAME}.${process.pid}.tmp`);
    // Include terminal exactly once.
    const body = perfTraceToJsonl({ includeTerminal: true });
    // Ensure trailing newline for JSONL tools.
    const payload =
      body.length > 0 ? `${body}\n` : `${JSON.stringify(buildProbeTerminalRecord())}\n`;

    try {
      writeFileSync(tempPath, payload, { encoding: "utf8", flag: "w" });
      try {
        const fd = openSync(tempPath, "r");
        try {
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      } catch {
        // fsync optional on some FS; rename still attempted.
      }
      renameSync(tempPath, target);
      flushCompleted = true;
      _markTerminalFlushedForTests();
      return { ok: true, path: target };
    } catch (err) {
      try {
        unlinkSync(tempPath);
      } catch {
        // ignore temp cleanup failure
      }
      try {
        // Do not leave a partial final file from a failed rename mid-write.
        unlinkSync(target);
      } catch {
        // final may not exist
      }
      return {
        ok: false,
        path: null,
        reason: err instanceof Error ? err.message : "write-failed",
      };
    }
  } catch {
    return { ok: false, path: null, reason: "unexpected" };
  }
}

/**
 * Register a before-quit fallback flush using Electron `app`.
 * No-ops when tracing disabled. Safe to call multiple times.
 */
export function registerPerfTraceBeforeQuitFlush(appLike: {
  getPath: (name: "userData") => string;
  once: (event: "before-quit", listener: () => void) => void;
}): void {
  if (!isPerfTraceEnabled()) return;
  if (beforeQuitRegistered) return;
  beforeQuitRegistered = true;
  try {
    appLike.once("before-quit", () => {
      try {
        const userData = appLike.getPath("userData");
        flushPerfTraceToUserData(userData);
      } catch {
        // never throw from quit hook
      }
    });
  } catch {
    // never throw from registration
  }
}
