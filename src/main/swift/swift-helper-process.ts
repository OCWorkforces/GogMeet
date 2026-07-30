/**
 * Bounded one-shot runner for the compiled Swift EventKit helper.
 *
 * Uses spawn (not execFile) so stdout/stderr are drained with hard byte ceilings
 * instead of Node's default maxBuffer. Settlement happens exactly once after
 * the child `close` event; abort/timeout/overflow still wait for close after
 * SIGTERM → grace → SIGKILL.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/** stdout allocation ceiling for one-shot EventKit dumps (not a performance optimum). */
export const SWIFT_HELPER_STDOUT_LIMIT_BYTES = 8 * 1024 * 1024;
/** stderr diagnostic ceiling. */
export const SWIFT_HELPER_STDERR_LIMIT_BYTES = 256 * 1024;
/** Wall-clock execution deadline for one-shot helper. */
export const SWIFT_HELPER_TIMEOUT_MS = 15_000;
/** Grace period after SIGTERM before SIGKILL — matches calendar-watch-sidecar. */
export const SWIFT_HELPER_KILL_GRACE_MS = 5_000;

export type SwiftHelperProcessFailureKind =
  | "timeout"
  | "abort"
  | "stdout-overflow"
  | "stderr-overflow"
  | "spawn"
  | "exit"
  | "signal";

export class SwiftHelperProcessError extends Error {
  readonly failureKind: SwiftHelperProcessFailureKind;
  readonly exitCode: number | undefined;
  readonly signal: NodeJS.Signals | null | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly spawnCode: string | undefined;

  constructor(
    failureKind: SwiftHelperProcessFailureKind,
    message: string,
    options: {
      exitCode?: number;
      signal?: NodeJS.Signals | null;
      stdout?: string;
      stderr?: string;
      spawnCode?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "SwiftHelperProcessError";
    this.failureKind = failureKind;
    this.exitCode = options.exitCode;
    this.signal = options.signal;
    this.stdout = options.stdout ?? "";
    this.stderr = options.stderr ?? "";
    this.spawnCode = options.spawnCode;
  }
}

export interface RunSwiftHelperProcessOptions {
  readonly binaryPath: string;
  readonly args?: readonly string[];
  readonly timeoutMs?: number;
  readonly stdoutLimitBytes?: number;
  readonly stderrLimitBytes?: number;
  readonly killGraceMs?: number;
  readonly signal?: AbortSignal;
}

export interface RunSwiftHelperProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function signalName(signal: AbortSignal): string {
  // DOMException name when available; fall back for Node test envs.
  try {
    if (signal.reason instanceof Error && signal.reason.name.length > 0) {
      return signal.reason.name;
    }
  } catch {
    // ignore
  }
  return "AbortError";
}

/**
 * Spawn the helper with concurrent stdout/stderr draining and hard limits.
 * Resolves once on successful exit 0; rejects once with SwiftHelperProcessError otherwise.
 */
export function runSwiftHelperProcess(
  options: RunSwiftHelperProcessOptions,
): Promise<RunSwiftHelperProcessResult> {
  const timeoutMs = options.timeoutMs ?? SWIFT_HELPER_TIMEOUT_MS;
  const stdoutLimit = options.stdoutLimitBytes ?? SWIFT_HELPER_STDOUT_LIMIT_BYTES;
  const stderrLimit = options.stderrLimitBytes ?? SWIFT_HELPER_STDERR_LIMIT_BYTES;
  const killGraceMs = options.killGraceMs ?? SWIFT_HELPER_KILL_GRACE_MS;
  const args = options.args ?? [];
  const upstream = options.signal;

  return new Promise<RunSwiftHelperProcessResult>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let stdoutOverflow = false;
    let stderrOverflow = false;
    let spawnError: NodeJS.ErrnoException | null = null;

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let killHandle: ReturnType<typeof setTimeout> | null = null;
    let child: ChildProcessWithoutNullStreams | null = null;

    const concatUtf8 = (chunks: Buffer[]): string => Buffer.concat(chunks).toString("utf8");

    const clearTimers = (): void => {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (killHandle !== null) {
        clearTimeout(killHandle);
        killHandle = null;
      }
    };

    const removeUpstream = (): void => {
      if (upstream) {
        upstream.removeEventListener("abort", onUpstreamAbort);
      }
    };

    const settleOk = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      removeUpstream();
      resolve({
        stdout: concatUtf8(stdoutChunks),
        stderr: concatUtf8(stderrChunks),
        exitCode,
      });
    };

    const settleErr = (error: SwiftHelperProcessError): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      removeUpstream();
      reject(error);
    };

    const requestKill = (): void => {
      if (child === null || child.killed) return;
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      if (killHandle !== null) return;
      killHandle = setTimeout(() => {
        killHandle = null;
        if (child !== null && !child.killed) {
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
        }
      }, killGraceMs);
      killHandle.unref?.();
    };

    const onUpstreamAbort = (): void => {
      aborted = true;
      requestKill();
    };

    const onStreamData = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      if (stream === "stdout") {
        if (stdoutOverflow) return;
        const next = stdoutBytes + chunk.length;
        if (next > stdoutLimit) {
          stdoutOverflow = true;
          const allowed = Math.max(0, stdoutLimit - stdoutBytes);
          if (allowed > 0) {
            stdoutChunks.push(chunk.subarray(0, allowed));
            stdoutBytes += allowed;
          }
          requestKill();
          return;
        }
        stdoutChunks.push(chunk);
        stdoutBytes = next;
        return;
      }

      if (stderrOverflow) return;
      const next = stderrBytes + chunk.length;
      if (next > stderrLimit) {
        stderrOverflow = true;
        const allowed = Math.max(0, stderrLimit - stderrBytes);
        if (allowed > 0) {
          stderrChunks.push(chunk.subarray(0, allowed));
          stderrBytes += allowed;
        }
        requestKill();
        return;
      }
      stderrChunks.push(chunk);
      stderrBytes = next;
    };

    if (upstream?.aborted) {
      settleErr(
        new SwiftHelperProcessError("abort", `Swift helper aborted (${signalName(upstream)})`, {
          stdout: "",
          stderr: "",
        }),
      );
      return;
    }

    try {
      child = spawn(options.binaryPath, [...args], {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      }) as ChildProcessWithoutNullStreams;
    } catch (err) {
      const code =
        err !== null && typeof err === "object" && "code" in err && typeof err.code === "string"
          ? err.code
          : undefined;
      settleErr(
        new SwiftHelperProcessError(
          "spawn",
          err instanceof Error ? err.message : "Swift helper spawn failed",
          {
            spawnCode: code,
            cause: err,
          },
        ),
      );
      return;
    }

    child.stdout.on("data", (chunk: Buffer | string) => {
      onStreamData("stdout", typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      onStreamData("stderr", typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      spawnError = err;
      // Ensure close eventually fires; request kill is a no-op if never started.
      requestKill();
    });

    child.on("close", (code, signal) => {
      const stdout = concatUtf8(stdoutChunks);
      const stderr = concatUtf8(stderrChunks);

      if (spawnError) {
        settleErr(
          new SwiftHelperProcessError(
            "spawn",
            spawnError.message || "Swift helper spawn failed",
            {
              spawnCode: typeof spawnError.code === "string" ? spawnError.code : undefined,
              stdout,
              stderr,
              cause: spawnError,
            },
          ),
        );
        return;
      }

      if (stdoutOverflow) {
        settleErr(
          new SwiftHelperProcessError(
            "stdout-overflow",
            `Swift helper stdout exceeded ${stdoutLimit} bytes`,
            { stdout, stderr, exitCode: code ?? undefined, signal },
          ),
        );
        return;
      }

      if (stderrOverflow) {
        settleErr(
          new SwiftHelperProcessError(
            "stderr-overflow",
            `Swift helper stderr exceeded ${stderrLimit} bytes`,
            { stdout, stderr, exitCode: code ?? undefined, signal },
          ),
        );
        return;
      }

      if (aborted) {
        settleErr(
          new SwiftHelperProcessError(
            "abort",
            `Swift helper aborted (${upstream ? signalName(upstream) : "AbortError"})`,
            { stdout, stderr, exitCode: code ?? undefined, signal },
          ),
        );
        return;
      }

      if (timedOut) {
        settleErr(
          new SwiftHelperProcessError(
            "timeout",
            `Swift helper timed out after ${timeoutMs}ms`,
            { stdout, stderr, exitCode: code ?? undefined, signal },
          ),
        );
        return;
      }

      if (signal) {
        settleErr(
          new SwiftHelperProcessError("signal", `Swift helper killed by signal ${signal}`, {
            stdout,
            stderr,
            signal,
            exitCode: code ?? undefined,
          }),
        );
        return;
      }

      if (code === 0) {
        settleOk(0);
        return;
      }

      settleErr(
        new SwiftHelperProcessError(
          "exit",
          `Swift helper exited with code ${code ?? "unknown"}`,
          {
            stdout,
            stderr,
            exitCode: code ?? undefined,
          },
        ),
      );
    });

    if (upstream) {
      upstream.addEventListener("abort", onUpstreamAbort, { once: true });
    }

    timeoutHandle = setTimeout(() => {
      timedOut = true;
      requestKill();
    }, timeoutMs);
    timeoutHandle.unref?.();
  });
}

/** True when a process failure indicates the binary path is missing or not executable. */
export function isIntegritySpawnFailure(
  error: Pick<SwiftHelperProcessError, "failureKind" | "spawnCode">,
): boolean {
  if (error.failureKind !== "spawn") return false;
  const code = error.spawnCode;
  return code === "ENOENT" || code === "ENOEXEC";
}
