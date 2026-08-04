/**
 * Parent-side launch/cleanup for packaged performance probes.
 * Trusts only script-level --output-dir; product writes fixed JSONL under isolated userData.
 */
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, basename, resolve } from "node:path";
import { tmpdir } from "node:os";

export const PERF_PROBE_USER_DATA_PREFIX = "gogmeet-perf-probe-";
export const PERF_TRACE_FILENAME = "gogmeet-perf-trace-v1.jsonl";
export const DEFAULT_PROBE_TIMEOUT_MS = 90_000;

export const PERF_PROBE_MODES = new Set(["startup", "tray", "alert", "safe-storage"]);

/**
 * @param {string} mode
 * @returns {boolean}
 */
export function isValidProbeMode(mode) {
  return PERF_PROBE_MODES.has(mode);
}

/**
 * Create an isolated userData directory under os.tmpdir() with the required prefix.
 * @returns {string}
 */
export function createProbeUserDataDir() {
  return mkdtempSync(join(tmpdir(), PERF_PROBE_USER_DATA_PREFIX));
}

/**
 * Recursively delete a probe userData root. Safe if missing.
 * @param {string} root
 */
export function cleanupProbeUserDataDir(root) {
  if (typeof root !== "string" || root.length === 0) return;
  const resolved = resolve(root);
  const tmp = resolve(tmpdir());
  if (!basename(resolved).startsWith(PERF_PROBE_USER_DATA_PREFIX)) {
    throw new Error(`Refusing to delete non-probe path: ${resolved}`);
  }
  if (!resolved.startsWith(tmp)) {
    throw new Error(`Refusing to delete path outside tmpdir: ${resolved}`);
  }
  rmSync(resolved, { recursive: true, force: true });
}

/**
 * @param {object} opts
 * @param {string} opts.electronPath - packaged app binary or electron executable
 * @param {string[]} [opts.appArgs]
 * @param {string} opts.mode
 * @param {string} opts.userDataDir
 * @param {string} opts.outputDir - trusted script-level evidence dir
 * @param {number} [opts.timeoutMs]
 * @param {Record<string, string>} [opts.env]
 * @returns {Promise<{ status: 'ok'|'blocked'|'timeout'|'crash', exitCode: number|null, tracePath: string|null, userDataDir: string }>}
 */
export async function launchPackagedProbe(opts) {
  const {
    electronPath,
    appArgs = [],
    mode,
    userDataDir,
    outputDir,
    timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
    env = {},
  } = opts;

  if (!isValidProbeMode(mode)) {
    return {
      status: "blocked",
      exitCode: null,
      tracePath: null,
      userDataDir,
      reason: "mode-invalid",
    };
  }
  if (!existsSync(electronPath)) {
    return {
      status: "blocked",
      exitCode: null,
      tracePath: null,
      userDataDir,
      reason: "native-runner-unavailable",
    };
  }

  mkdirSync(outputDir, { recursive: true });

  const childEnv = {
    ...process.env,
    ...env,
    GOGMEET_PERF_PROBE: mode,
    GOGMEET_PERF_TRACE: "1",
  };

  const args = [`--user-data-dir=${userDataDir}`, ...appArgs];

  return await new Promise((resolvePromise) => {
    let settled = false;
    const child = spawn(electronPath, args, {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const killEscalation = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          if (!child.killed) child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, 5_000).unref?.();
    };

    const timer = setTimeout(() => {
      if (settled) return;
      killEscalation();
    }, timeoutMs);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        status: "crash",
        exitCode: null,
        tracePath: null,
        userDataDir,
        reason: err.message,
      });
    });

    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const src = join(userDataDir, PERF_TRACE_FILENAME);
      let tracePath = null;
      if (existsSync(src)) {
        const dest = join(outputDir, PERF_TRACE_FILENAME);
        try {
          copyFileSync(src, dest);
          tracePath = dest;
        } catch {
          // copy failure is fatal for native success
        }
      }

      if (signal === "SIGTERM" || signal === "SIGKILL") {
        resolvePromise({
          status: "timeout",
          exitCode: code,
          tracePath,
          userDataDir,
        });
        return;
      }
      if (code === 2) {
        resolvePromise({
          status: "blocked",
          exitCode: code,
          tracePath,
          userDataDir,
        });
        return;
      }
      if (code === 0 && tracePath) {
        resolvePromise({
          status: "ok",
          exitCode: code,
          tracePath,
          userDataDir,
        });
        return;
      }
      resolvePromise({
        status: code === 0 ? "ok" : "crash",
        exitCode: code,
        tracePath,
        userDataDir,
      });
    });
  });
}

/**
 * Run probe with automatic userData create + finally cleanup.
 */
export async function withPackagedProbe(opts) {
  const userDataDir = opts.userDataDir ?? createProbeUserDataDir();
  try {
    return await launchPackagedProbe({ ...opts, userDataDir });
  } finally {
    cleanupProbeUserDataDir(userDataDir);
  }
}

/** Inventory helper for tests. */
export function listProbeArtifacts(outputDir) {
  if (!existsSync(outputDir)) return [];
  return readdirSync(outputDir).filter((n) => {
    try {
      return statSync(join(outputDir, n)).isFile();
    } catch {
      return false;
    }
  });
}
