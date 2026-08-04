/**
 * Packaged measurement probe dispatcher.
 * Recognizes only finite GOGMEET_PERF_PROBE modes after strict preflight.
 */

import { app } from "electron";

import {
  type PerfProbeMode,
  preflightPerformanceProbe,
} from "./performance-probe-contract.js";
import { isPerfTraceEnabled, perfTrace } from "../utils/performance-trace.js";
import {
  flushPerfTraceToUserData,
  registerPerfTraceBeforeQuitFlush,
} from "../utils/performance-trace-file.js";

export type ProbeRunResult =
  | { status: "ok"; mode: PerfProbeMode }
  | { status: "blocked"; reason: string }
  | { status: "fatal"; reason: string };

/**
 * Validate env + packaged + userData before any probe surface runs.
 */
export function preflightOrBlock():
  | { ok: true; mode: PerfProbeMode; userDataPath: string }
  | { ok: false; result: ProbeRunResult } {
  let userData = "";
  try {
    userData = app.getPath("userData");
  } catch (err) {
    return {
      ok: false,
      result: {
        status: "blocked",
        reason: err instanceof Error ? err.message : "userData unavailable",
      },
    };
  }
  const preflight = preflightPerformanceProbe({
    envMode: process.env["GOGMEET_PERF_PROBE"],
    isPackaged: app.isPackaged,
    perfTraceEnabled: isPerfTraceEnabled(),
    userDataPath: userData,
  });
  if (!preflight.ok) {
    return {
      ok: false,
      result: { status: "blocked", reason: preflight.reason },
    };
  }
  return { ok: true, mode: preflight.mode, userDataPath: preflight.userDataPath };
}

function recordNotExercised(phase: string): void {
  // Finite startup-phase not-exercised rows for safe-profile receipts.
  const allowed = new Set([
    "updater",
    "helper-spawn",
    "helper-query",
    "helper-parse",
    "power-events",
    "global-shortcuts",
    "notification-permission",
    "auto-launch",
    "oauth",
    "shell-egress",
  ]);
  if (!allowed.has(phase)) return;
  perfTrace({
    operation: "startup-phase",
    phase: phase as
      | "updater"
      | "helper-spawn"
      | "helper-query"
      | "helper-parse"
      | "power-events"
      | "global-shortcuts"
      | "notification-permission"
      | "auto-launch"
      | "oauth"
      | "shell-egress",
    outcome: "not-exercised",
    startMs: 0,
    durationMs: 0,
  });
}

/**
 * After probe-safe initializeApp completes, record suppressed external phases
 * and flush the fixed trace file, then exit.
 */
export function finalizeStartupProbe(userDataPath: string): void {
  for (const phase of [
    "updater",
    "helper-spawn",
    "helper-query",
    "helper-parse",
    "power-events",
    "global-shortcuts",
    "notification-permission",
    "auto-launch",
    "oauth",
    "shell-egress",
  ] as const) {
    recordNotExercised(phase);
  }
  registerPerfTraceBeforeQuitFlush(app);
  flushPerfTraceToUserData(userDataPath);
  perfTrace({
    operation: "synthetic",
    outcome: "ok",
    startMs: 0,
    durationMs: 0,
    count: 1,
  });
  // Re-flush so terminal reflects final counters.
  flushPerfTraceToUserData(userDataPath);
}

/**
 * Non-startup modes branch before full product init and exercise only their surface.
 */
export async function runNamedProbeSurface(
  mode: Exclude<PerfProbeMode, "startup">,
  userDataPath: string,
): Promise<ProbeRunResult> {
  try {
    registerPerfTraceBeforeQuitFlush(app);
    if (mode === "tray") {
      const { runTrayProbe } = await import("./performance-probes/tray-probe.js");
      await runTrayProbe(userDataPath);
    } else if (mode === "alert") {
      const { runAlertProbe } = await import("./performance-probes/alert-probe.js");
      await runAlertProbe(userDataPath);
    } else {
      // safe-storage: Windows-native only for meaningful safeStorage; still runs adapters.
      const { runSafeStorageProbe } = await import("./performance-probes/safe-storage-probe.js");
      await runSafeStorageProbe(userDataPath);
    }
    // Ensure terminal is published even if driver already flushed.
    flushPerfTraceToUserData(userDataPath);
    return { status: "ok", mode };
  } catch (err) {
    try {
      flushPerfTraceToUserData(userDataPath);
    } catch {
      // ignore
    }
    return {
      status: "fatal",
      reason: err instanceof Error ? err.message : "probe-surface-failed",
    };
  }
}
