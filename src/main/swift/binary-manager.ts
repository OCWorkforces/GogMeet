import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";

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

export { BINARY_PATH, computeSwiftSourceHash } from "./binary-cache.js";

const execFileAsync = promisify(execFile);

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

  // Compute hash of current Swift source (throws clear error if missing)
  const sourceBytes = await readSwiftSource(swiftSrc);
  const currentHash = createHash("sha256").update(sourceBytes).digest("hex");

  // Check if binary exists AND hash matches
  let needsCompile = false;
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
    needsCompile = true;
  } else {
    // Binary doesn't exist — need to compile
    needsCompile = true;
  }

  if (!needsCompile) {
    return;
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
