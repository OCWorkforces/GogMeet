import { createHash } from "node:crypto";
import { readFile, writeFile, unlink, stat, access, copyFile, constants as fsConstants } from "node:fs/promises";
import { join } from "node:path";

import {
  BINARY_PATH,
  HASH_PATH,
  ensureSecureCacheDir,
  isBinaryExecutable,
  lockdownBinary,
  readSwiftSource,
  resolveBundledHelperPath,
  resolveSwiftSourcePath,
  verifyBinaryHash,
} from "./binary-cache.js";
import { compileWithRetries, stripBinary } from "./binary-compiler.js";
import { classifySwiftError, SWIFT_EXIT_CODES, SwiftHelperError } from "./event-validator.js";
import {
  isIntegritySpawnFailure,
  runSwiftHelperProcess,
  SwiftHelperProcessError,
} from "./swift-helper-process.js";

/** Exit codes that are semantic helper outcomes — do not recompile on these. */
function isSemanticSwiftExit(exitCode: number | undefined): boolean {
  return (
    exitCode === SWIFT_EXIT_CODES.PERMISSION_DENIED ||
    exitCode === SWIFT_EXIT_CODES.NO_CALENDARS ||
    exitCode === SWIFT_EXIT_CODES.OTHER
  );
}

let hashVerified = false;
let ensureBinaryInFlight: Promise<void> | null = null;

interface SourceHashCacheEntry {
  readonly path: string;
  readonly mtimeMs: number;
  readonly hash: string;
}
let sourceHashCache: SourceHashCacheEntry | null = null;

/**
 * Compute and memoize the SHA-256 hash of the Swift source. Cache key is the
 * source path + mtimeMs reported by `stat()`. When mtime is unchanged we reuse
 * the previously-hashed digest and skip both the source read and re-hash.
 * The cache is process-local; the on-disk hash sidecar is unchanged.
 */
async function getSourceHash(swiftSrc: string): Promise<string> {
  // Try to stat first for the mtime cache key. If stat fails (e.g. ENOENT),
  // fall through to readSwiftSource so the caller sees the clear
  // "Swift source not found at ..." error rather than a raw ENOENT.
  let mtimeMs: number | null = null;
  try {
    const stats = await stat(swiftSrc);
    mtimeMs = stats.mtimeMs;
  } catch (err) {
    logDebug(err);
  }
  if (
    mtimeMs !== null &&
    sourceHashCache !== null &&
    sourceHashCache.path === swiftSrc &&
    sourceHashCache.mtimeMs === mtimeMs
  ) {
    return sourceHashCache.hash;
  }
  const sourceBytes = await readSwiftSource(swiftSrc);
  const hash = createHash("sha256").update(sourceBytes).digest("hex");
  if (mtimeMs !== null) {
    sourceHashCache = { path: swiftSrc, mtimeMs, hash };
  } else {
    sourceHashCache = null;
  }
  return hash;
}

function invalidateSourceHashCache(): void {
  sourceHashCache = null;
}

function logError(error: unknown): void {
  console.error("[binary-manager]", error);
}

function logDebug(error: unknown): void {
  // Truly ignorable cases (e.g. optional cleanup) — log at debug level.
  console.debug("[binary-manager]", error);
}

async function tryInstallBundledHelper(): Promise<boolean> {
  // Only packaged Electron builds may ship an optional helper under Resources/.
  // resolveBundledHelperPath() is null outside asar packaging (dev / unit tests).
  if (resolveBundledHelperPath() === null) return false;

  // Probe arch-specific then generic paths under process.resourcesPath.
  const resources = process.resourcesPath;
  if (typeof resources !== "string" || resources.length === 0) return false;
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const paths = [
    join(resources, `googlemeet-events-${arch}`),
    join(resources, "googlemeet-events"),
    join(resources, "helpers", `googlemeet-events-${arch}`),
    join(resources, "helpers", "googlemeet-events"),
  ];
  for (const p of paths) {
    try {
      await access(p, fsConstants.X_OK);
      await ensureSecureCacheDir();
      await copyFile(p, BINARY_PATH);
      await lockdownBinary(BINARY_PATH);
      // Mark hash as matching current source so we do not immediately recompile.
      try {
        const swiftSrc = resolveSwiftSourcePath();
        const currentHash = await getSourceHash(swiftSrc);
        await writeFile(HASH_PATH, currentHash, "utf-8");
      } catch {
        // Source missing in some test fixtures — still use bundled binary.
      }
      console.log("[binary-manager] Using bundled Swift helper");
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

async function ensureBinaryCycle(): Promise<void> {
  // Locate Swift source
  // IMPORTANT: swiftc cannot read files from inside ASAR archives.
  // We must use the unpacked version when running from ASAR.
  // electron-builder.yml has asarUnpack configured for this file.
  const swiftSrc = resolveSwiftSourcePath();

  await ensureSecureCacheDir();

  // Prefer a prebuilt helper shipped in Resources/ when present (optional).
  if (!(await isBinaryExecutable())) {
    const installed = await tryInstallBundledHelper();
    if (installed && (await isBinaryExecutable())) {
      return;
    }
  }

  // Compute hash of current Swift source (memoized by mtime). Throws clear
  // error if source missing via readSwiftSource on cache miss.
  const currentHash = await getSourceHash(swiftSrc);

  // Check if binary exists AND hash matches
  if (await isBinaryExecutable()) {
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
    // Stale binary path also means any in-process cache should be re-validated
    // on the next ensureBinary cycle.
    invalidateSourceHashCache();
  }

  await compileWithRetries(swiftSrc);

  // Strip debug symbols from compiled binary for smaller size
  await stripBinary();

  // Lock down the compiled binary so other users on the host cannot read or
  // execute the cached helper.
  await lockdownBinary(BINARY_PATH);

  // Store hash for future comparisons
  await writeFile(HASH_PATH, currentHash, "utf-8");
}

/** Compile the Swift EventKit helper if not already compiled. */
export function ensureBinary(): Promise<void> {
  if (ensureBinaryInFlight !== null) {
    return ensureBinaryInFlight;
  }

  ensureBinaryInFlight = ensureBinaryCycle().finally(() => {
    ensureBinaryInFlight = null;
  });
  return ensureBinaryInFlight;
}

/** Duck-type process errors so tests with resetModules still classify correctly. */
function asProcessError(err: unknown): SwiftHelperProcessError | null {
  if (err instanceof SwiftHelperProcessError) return err;
  if (
    err instanceof Error &&
    err.name === "SwiftHelperProcessError" &&
    "failureKind" in err &&
    typeof (err as { failureKind: unknown }).failureKind === "string"
  ) {
    return err as SwiftHelperProcessError;
  }
  return null;
}

function toSwiftHelperError(err: unknown): SwiftHelperError {
  if (err instanceof SwiftHelperError) return err;
  const processErr = asProcessError(err);
  if (processErr) {
    if (processErr.failureKind === "exit" && isSemanticSwiftExit(processErr.exitCode)) {
      return classifySwiftError({
        code: processErr.exitCode,
        message: processErr.message,
        stderr: processErr.stderr,
      });
    }
    // Map process failures into classifySwiftError-compatible shape without
    // logging raw calendar payloads (stdout is retained only on the error object
    // for local debugging by callers that already expect helper output).
    return classifySwiftError({
      code: processErr.spawnCode ?? processErr.exitCode,
      message: processErr.message,
      stderr: processErr.stderr,
    });
  }
  return classifySwiftError(err);
}

/**
 * Independently re-read executable + hash integrity before the sole permitted
 * recompile path. Returns true only when the on-disk binary is missing, not
 * executable, or its hash no longer matches the source hash sidecar.
 */
async function revalidateIntegrityFailure(): Promise<boolean> {
  hashVerified = false;
  const executable = await isBinaryExecutable();
  if (!executable) return true;
  const matches = await verifyBinaryHash();
  return !matches;
}

async function invalidateAndRecompileOnce(): Promise<void> {
  console.warn("[binary-manager] Swift binary integrity failure — recompiling once");
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
  invalidateSourceHashCache();
  hashVerified = false;
  await ensureBinary();
}

async function executeHelper(signal?: AbortSignal): Promise<string> {
  const result = await runSwiftHelperProcess({
    binaryPath: BINARY_PATH,
    args: [],
    ...(signal !== undefined ? { signal } : {}),
  });
  return result.stdout.trim();
}

/**
 * Run the compiled Swift EventKit helper and return raw stdout.
 * Optional AbortSignal cancels the child (SIGTERM → grace → SIGKILL).
 *
 * Recompiles at most once, and only after verified integrity failure
 * (hash mismatch / missing-or-non-executable binary / spawn ENOENT|ENOEXEC).
 * Timeout, output overflow, semantic EventKit exits, and other process
 * failures never unlink or recompile the binary.
 */
export async function runSwiftHelper(signal?: AbortSignal): Promise<string> {
  await ensureBinary();

  let matches = true;
  if (!hashVerified) {
    matches = await verifyBinaryHash();
    hashVerified = matches;
  }

  if (!matches) {
    logError(new Error(`Swift binary hash mismatch at ${BINARY_PATH}; will recompile`));
    const stillBroken = await revalidateIntegrityFailure();
    if (stillBroken) {
      await invalidateAndRecompileOnce();
    }
  }

  try {
    return await executeHelper(signal);
  } catch (err) {
    const processErr = asProcessError(err);
    const classified = toSwiftHelperError(err);

    // Structured EventKit outcomes never recompile.
    if (isSemanticSwiftExit(classified.exitCode)) {
      throw classified;
    }

    // Only integrity-class spawn failures may recompile — and only after
    // independent revalidation of executable/hash state.
    const integritySpawn = processErr !== null && isIntegritySpawnFailure(processErr);
    if (!integritySpawn) {
      throw classified;
    }

    const stillBroken = await revalidateIntegrityFailure();
    if (!stillBroken) {
      // Transient spawn failure without confirmed integrity break — do not thrash.
      throw classified;
    }

    logError(err);
    try {
      await invalidateAndRecompileOnce();
      return await executeHelper(signal);
    } catch (retryErr) {
      console.error("[binary-manager] Swift binary recompile/retry failed:", retryErr);
      const retryClassified = toSwiftHelperError(retryErr);
      if (isSemanticSwiftExit(retryClassified.exitCode)) {
        throw retryClassified;
      }
      if (retryErr instanceof SwiftHelperError) {
        throw retryErr;
      }
      throw retryClassified;
    }
  }
}
