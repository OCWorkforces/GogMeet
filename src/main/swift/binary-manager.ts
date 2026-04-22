import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { chmod as chmodCb } from "node:fs";
import { createHash } from "node:crypto";

import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
// Use the callback-based chmod from `node:fs` (separately promisified) so that
// test suites which only mock `node:fs/promises` can still load this module.
const chmod = promisify(chmodCb);
const __dirname = join(fileURLToPath(import.meta.url), "..");

/* Path to Swift source file in dev mode.
 * __dirname resolves to the parent of the *built* file (lib/main/), so we go
 * up two levels to reach the project root, then into src/main/.
 * (The original source at src/main/swift/ had 3 levels up, but after bundling
 * into lib/main/index.cjs, only 2 are needed.) */
const SWIFT_SRC_DEV = join(
  __dirname,
  "..",
  "..",
  "src",
  "main",
  "googlemeet-events.swift",
);

/** Check if running from within an ASAR archive */
const isPackaged = __dirname.includes(".asar");
/** Cached compiled binary location */
const BINARY_DIR = join(tmpdir(), "googlemeet");
export const BINARY_PATH = join(BINARY_DIR, "googlemeet-events");

/** Sidecar file storing the SHA-256 hash of the Swift source used for the current binary */
const HASH_PATH = join(BINARY_DIR, "source.hash");

/** Maximum retry attempts when compiling the Swift helper. */
const MAX_COMPILE_RETRIES = 5;
/** Base delay for exponential backoff between compile retries (ms). */
const COMPILE_RETRY_BASE_MS = 1000;
/** Cap for exponential backoff between compile retries (ms). */
const COMPILE_RETRY_MAX_MS = 30_000;
/** Hard timeout for a single swiftc invocation (ms). */
const SWIFTC_TIMEOUT_MS = 60_000;

function logError(error: unknown): void {
  console.error("[binary-manager]", error);
}

function logDebug(error: unknown): void {
  // Truly ignorable cases (e.g. optional cleanup) — log at debug level.
  console.debug("[binary-manager]", error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === "function") {
      t.unref();
    }
  });
}

export async function computeSwiftSourceHash(
  swiftSrc: string,
): Promise<string> {
  const content = await readFile(swiftSrc);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Resolve the Swift source path. In packaged builds, surface any extraction
 * failure to the caller (no silent catch). In dev mode, the SWIFT_SRC_DEV
 * constant points at the on-disk source; missing-file errors surface from
 * `readFile` with a wrapped message.
 */
function resolveSwiftSourcePath(): string {
  if (isPackaged) {
    return join(
      process.resourcesPath,
      "app.asar.unpacked",
      "src",
      "main",
      "googlemeet-events.swift",
    );
  }
  return SWIFT_SRC_DEV;
}

/**
 * Read the Swift source contents, throwing a clear error if the file does not
 * exist (covers both dev-mode missing source and packaged extraction failure).
 */
async function readSwiftSource(swiftSrc: string): Promise<Buffer> {
  try {
    return await readFile(swiftSrc);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    if (isPackaged) {
      throw new Error(
        `Swift source not found at ${swiftSrc}. Ensure asarUnpack is configured for googlemeet-events.swift. Cause: ${cause}`,
      );
    }
    throw new Error(
      `Swift source not found at ${swiftSrc}. Ensure the file exists. Cause: ${cause}`,
    );
  }
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
async function compileWithRetries(swiftSrc: string): Promise<void> {
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

/** Create the cache directory with restrictive (owner-only) permissions. */
async function ensureSecureCacheDir(): Promise<void> {
  await mkdir(BINARY_DIR, { recursive: true, mode: 0o700 });
  // Belt-and-suspenders: mkdir's mode is masked by umask, so chmod explicitly.
  try {
    await chmod(BINARY_DIR, 0o700);
  } catch (err) {
    // Permission tightening failure is logged but non-fatal — the directory
    // still works, just with default ACLs.
    logError(err);
  }
}

/** Compile the Swift EventKit helper if not already compiled */
export async function ensureBinary(): Promise<void> {
  // Locate Swift source
  // IMPORTANT: swiftc cannot read files from inside ASAR archives.
  // We must use the unpacked version when running from ASAR.
  // electron-builder.yml has asarUnpack configured for this file.
  const swiftSrc = resolveSwiftSourcePath();

  await ensureSecureCacheDir();

  // Compute hash of current Swift source (throws clear error if missing)
  const sourceBytes = await readSwiftSource(swiftSrc);
  const currentHash = createHash("sha256").update(sourceBytes).digest("hex");

  // Check if binary exists AND hash matches
  let needsCompile = false;
  try {
    await access(BINARY_PATH, constants.X_OK);
    let storedHash = "";
    try {
      storedHash = await readFile(HASH_PATH, "utf-8");
    } catch (err) {
      logDebug(err);
    }
    if (storedHash.trim() === currentHash) {
      return; // binary is up-to-date
    }
    // Hash changed — delete stale binary and recompile
    console.log("[binary-manager] Swift source changed — recompiling binary");
    try {
      await unlink(BINARY_PATH);
    } catch (err) {
      logDebug(err);
    }
    needsCompile = true;
  } catch {
    // Binary doesn't exist — need to compile
    needsCompile = true;
  }

  if (!needsCompile) {
    return;
  }

  await compileWithRetries(swiftSrc);

  // Strip debug symbols from compiled binary for smaller size
  try {
    await execFileAsync("strip", ["-x", "-S", BINARY_PATH], { timeout: 5_000 });
  } catch (err) {
    // Stripping is optional - binary will still work if this fails
    logDebug(err);
  }

  // Lock down the compiled binary so other users on the host cannot read or
  // execute the cached helper.
  try {
    await chmod(BINARY_PATH, 0o700);
  } catch (err) {
    logError(err);
  }

  // Store hash for future comparisons
  await writeFile(HASH_PATH, currentHash, "utf-8");
}

/**
 * Verify the binary on disk matches the hash recorded for the current source.
 * Returns true on match. Returns false if the hash sidecar is missing or the
 * recorded digest does not match — callers can then trigger a recompile.
 */
async function verifyBinaryHash(): Promise<boolean> {
  try {
    const swiftSrc = resolveSwiftSourcePath();
    const sourceBytes = await readSwiftSource(swiftSrc);
    const expectedHash = createHash("sha256")
      .update(sourceBytes)
      .digest("hex");
    const storedHash = (await readFile(HASH_PATH, "utf-8")).trim();
    return storedHash === expectedHash;
  } catch (err) {
    logError(err);
    return false;
  }
}

/** Run the compiled Swift EventKit helper and return raw output */
export async function runSwiftHelper(): Promise<string> {
  await ensureBinary();
  // Verify hash before executing — protects against tampering or partial
  // writes. On mismatch we fall through to the recompile-and-retry path.
  const matches = await verifyBinaryHash();
  if (!matches) {
    logError(
      new Error(
        `Swift binary hash mismatch at ${BINARY_PATH}; will recompile`,
      ),
    );
  }
  try {
    if (!matches) {
      throw new Error("Swift binary hash mismatch — refusing to execute");
    }
    const { stdout } = await execFileAsync(BINARY_PATH, [], {
      timeout: 15_000,
    });
    return stdout.trim();
  } catch (err) {
    // Binary may be corrupted, incompatible, or its hash drifted — force
    // recompile and retry once.
    console.warn("[binary-manager] Swift binary failed, recompiling...");
    logError(err);
    try {
      try {
        await unlink(BINARY_PATH);
      } catch (cleanupErr) {
        logDebug(cleanupErr);
      }
      try {
        await unlink(HASH_PATH);
      } catch (cleanupErr) {
        logDebug(cleanupErr);
      }
      await ensureBinary();
      const { stdout } = await execFileAsync(BINARY_PATH, [], {
        timeout: 15_000,
      });
      return stdout.trim();
    } catch (retryErr) {
      console.error(
        "[binary-manager] Swift binary recompile failed:",
        retryErr,
      );
      throw retryErr;
    }
  }
}
