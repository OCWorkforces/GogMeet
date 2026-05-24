import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFile, writeFile, unlink, stat } from "node:fs/promises";

import {
  BINARY_PATH,
  HASH_PATH,
  ensureSecureCacheDir,
  isBinaryExecutable,
  lockdownBinary,
  readSwiftSource,
  resolveSwiftSourcePath,
  verifyBinaryHash,
} from "./binary-cache.js";
import { compileWithRetries, stripBinary } from "./binary-compiler.js";

const execFileAsync = promisify(execFile);

let hashVerified = false;

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

/** Compile the Swift EventKit helper if not already compiled */
export async function ensureBinary(): Promise<void> {
  // Locate Swift source
  // IMPORTANT: swiftc cannot read files from inside ASAR archives.
  // We must use the unpacked version when running from ASAR.
  // electron-builder.yml has asarUnpack configured for this file.
  const swiftSrc = resolveSwiftSourcePath();

  await ensureSecureCacheDir();

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

/** Run the compiled Swift EventKit helper and return raw output */
export async function runSwiftHelper(): Promise<string> {
  await ensureBinary();
  // Verify hash once per process lifetime — binary is cached, re-verifying
  // every poll is redundant steady-state I/O. On mismatch we fall through
  // to the recompile-and-retry path.
  let matches = true;
  if (!hashVerified) {
    matches = await verifyBinaryHash();
    hashVerified = matches;
  }
  if (!matches) {
    logError(new Error(`Swift binary hash mismatch at ${BINARY_PATH}; will recompile`));
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
      // Forget cached source hash so the retry recompile re-reads the source.
      invalidateSourceHashCache();
      await ensureBinary();
      const { stdout } = await execFileAsync(BINARY_PATH, [], {
        timeout: 15_000,
      });
      return stdout.trim();
    } catch (retryErr) {
      console.error("[binary-manager] Swift binary recompile failed:", retryErr);
      throw retryErr;
    }
  }
}
