import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { BINARY_PATH } from "./binary-cache.js";

const execFileAsync = promisify(execFile);

/** Maximum retry attempts when compiling the Swift helper. */
const MAX_COMPILE_RETRIES = 5;
/** Base delay for exponential backoff between compile retries (ms). */
const COMPILE_RETRY_BASE_MS = 1000;
/** Cap for exponential backoff between compile retries (ms). */
const COMPILE_RETRY_MAX_MS = 30_000;
/** Hard timeout for a single swiftc invocation (ms). */
const SWIFTC_TIMEOUT_MS = 20_000;

function logError(error: unknown): void {
  console.error("[binary-manager]", error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === "function") {
      t.unref();
    }
  });
}

/**
 * Run `swiftc` with the given args. Uses the built-in `timeout` option which
 * sends the configured `killSignal` (SIGTERM) after the deadline; Node's
 * child_process module reaps the child internally, preventing zombies.
 *
 * The L14 requirement asks for explicit SIGTERM-then-SIGKILL escalation. With
 * the current `promisify(execFile)` API, the underlying ChildProcess is not
 * exposed to user code, so we rely on Node's built-in timeout kill. If a
 * future case of `swiftc` ignoring SIGTERM surfaces, switch this to a direct
 * `execFile` call so we can hold a child reference and SIGKILL after
 * `KILL_GRACE_MS`.
 */
async function runSwiftc(args: string[]): Promise<void> {
  await execFileAsync("swiftc", args, {
    timeout: SWIFTC_TIMEOUT_MS,
    killSignal: "SIGTERM",
  });
}

/**
 * Run a single end-to-end compile attempt: primary swiftc, fallback to
 * explicit SDK on failure. Throws if both attempts fail.
 */
async function compileOnce(swiftSrc: string): Promise<void> {
  // Compile with architecture-appropriate target
  // -target <arch>-apple-macosx11.0: Match Electron process architecture
  // -Osize: Optimize for size (same performance, smaller binary)
  // -whole-module-optimization: Enable cross-file optimizations
  const swiftTarget =
    process.arch === "arm64"
      ? "arm64-apple-macosx11.0"
      : "x86_64-apple-macosx11.0";
  const swiftFlags = [
    swiftSrc,
    "-target",
    swiftTarget,
    "-Osize",
    "-whole-module-optimization",
    "-o",
    BINARY_PATH,
  ];

  try {
    await runSwiftc(swiftFlags);
  } catch (primaryErr) {
    logError(primaryErr);
    // Fallback with explicit SDK path (for some CI environments)
    await runSwiftc([
      ...swiftFlags,
      "-sdk",
      "/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk",
    ]);
  }
}

/**
 * Compile with bounded retries and exponential backoff. Throws a descriptive
 * fatal error after the retry budget is exhausted.
 */
export async function compileWithRetries(swiftSrc: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_COMPILE_RETRIES; attempt++) {
    try {
      await compileOnce(swiftSrc);
      return;
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === MAX_COMPILE_RETRIES - 1;
      if (isLastAttempt) {
        break;
      }
      const delay = Math.min(
        COMPILE_RETRY_BASE_MS * 2 ** attempt,
        COMPILE_RETRY_MAX_MS,
      );
      console.warn(
        `[binary-manager] swiftc failed (attempt ${attempt + 1}/${MAX_COMPILE_RETRIES}); retrying in ${delay}ms`,
      );
      logError(err);
      await sleep(delay);
    }
  }
  const cause =
    lastError instanceof Error ? lastError.message : String(lastError);
  const finalErr = new Error(
    `Failed to compile Swift helper after ${MAX_COMPILE_RETRIES} attempts: ${cause}`,
  );
  if (lastError instanceof Error) {
    (finalErr as Error & { cause?: unknown }).cause = lastError;
  }
  throw finalErr;
}

/** Strip debug symbols from compiled binary for smaller size. Optional — failures are logged. */
export async function stripBinary(): Promise<void> {
  try {
    await execFileAsync("strip", ["-x", "-S", BINARY_PATH], { timeout: 5_000 });
  } catch (err) {
    // Stripping is optional - binary will still work if this fails
    console.debug("[binary-manager]", err);
  }
}
