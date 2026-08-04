/**
 * Finite contracts for private packaged measurement probes.
 * No free-form mode names or caller-controlled paths.
 */

import { realpathSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { tmpdir } from "node:os";

export const PERF_PROBE_MODES = ["startup", "tray", "alert", "safe-storage"] as const;
export type PerfProbeMode = (typeof PERF_PROBE_MODES)[number];

/** Required basename prefix for isolated probe userData under os.tmpdir(). */
export const PERF_PROBE_USER_DATA_PREFIX = "gogmeet-perf-probe-" as const;

export const PERF_PROBE_ENV = "GOGMEET_PERF_PROBE" as const;

export type ProbePreflightFailure =
  | "mode-absent"
  | "mode-invalid"
  | "not-packaged"
  | "trace-disabled"
  | "user-data-missing"
  | "user-data-not-dir"
  | "user-data-prefix"
  | "user-data-not-under-tmpdir"
  | "user-data-symlink-escape";

export type ProbePreflightResult =
  | { ok: true; mode: PerfProbeMode; userDataPath: string }
  | { ok: false; reason: ProbePreflightFailure; detail?: string };

export function parsePerfProbeMode(raw: string | undefined | null): PerfProbeMode | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if ((PERF_PROBE_MODES as readonly string[]).includes(raw)) {
    return raw as PerfProbeMode;
  }
  return null;
}

/**
 * Validate isolated probe userData: real directory, basename prefix, under tmpdir.
 */
export function validateProbeUserDataDir(userDataPath: string):
  | {
      ok: true;
      resolved: string;
    }
  | {
      ok: false;
      reason: ProbePreflightFailure;
      detail?: string;
    } {
  if (typeof userDataPath !== "string" || userDataPath.trim().length === 0) {
    return { ok: false, reason: "user-data-missing" };
  }
  let resolved: string;
  try {
    resolved = resolve(userDataPath);
  } catch {
    return { ok: false, reason: "user-data-missing" };
  }

  const name = basename(resolved);
  if (!name.startsWith(PERF_PROBE_USER_DATA_PREFIX)) {
    return { ok: false, reason: "user-data-prefix", detail: name };
  }

  let st;
  try {
    st = statSync(resolved);
  } catch {
    return { ok: false, reason: "user-data-missing" };
  }
  if (!st.isDirectory()) {
    return { ok: false, reason: "user-data-not-dir" };
  }

  let real: string;
  try {
    real = realpathSync(resolved);
  } catch {
    return { ok: false, reason: "user-data-missing" };
  }

  const tmpRoot = realpathSync(tmpdir());
  const underTmp =
    real === tmpRoot ||
    real.startsWith(
      tmpRoot.endsWith("/") || tmpRoot.endsWith("\\")
        ? tmpRoot
        : tmpRoot + (process.platform === "win32" ? "\\" : "/"),
    );
  if (!underTmp) {
    return { ok: false, reason: "user-data-not-under-tmpdir", detail: real };
  }

  // Symlink escape: resolved real path basename must still carry the prefix
  // when the leaf was a symlink outside the allowed tree.
  // Strict: resolved leaf basename must keep the probe prefix (no includes-based escape).
  if (!basename(real).startsWith(PERF_PROBE_USER_DATA_PREFIX)) {
    return { ok: false, reason: "user-data-symlink-escape", detail: real };
  }

  return { ok: true, resolved: real };
}

/**
 * Full preflight for packaged probe mode. Call before any calendar/token adapters.
 */
export function preflightPerformanceProbe(options: {
  envMode: string | undefined;
  isPackaged: boolean;
  perfTraceEnabled: boolean;
  userDataPath: string;
}): ProbePreflightResult {
  if (options.envMode === undefined || options.envMode === "") {
    return { ok: false, reason: "mode-absent" };
  }
  const mode = parsePerfProbeMode(options.envMode);
  if (mode === null) {
    return { ok: false, reason: "mode-invalid", detail: options.envMode };
  }
  if (!options.isPackaged) {
    return { ok: false, reason: "not-packaged" };
  }
  if (!options.perfTraceEnabled) {
    return { ok: false, reason: "trace-disabled" };
  }
  const ud = validateProbeUserDataDir(options.userDataPath);
  if (!ud.ok) {
    return {
      ok: false,
      reason: ud.reason,
      ...(ud.detail !== undefined ? { detail: ud.detail } : {}),
    };
  }
  return { ok: true, mode, userDataPath: ud.resolved };
}

/** True when a probe mode env is set (even if invalid) — used to avoid normal boot. */
export function isPerfProbeEnvPresent(): boolean {
  const raw = process.env[PERF_PROBE_ENV];
  return typeof raw === "string" && raw.length > 0;
}
