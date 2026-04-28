import { access, mkdir, readFile } from "node:fs/promises";
import { chmod as chmodCb } from "node:fs";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
export const BINARY_DIR = join(tmpdir(), "googlemeet");
export const BINARY_PATH = join(BINARY_DIR, "googlemeet-events");

/** Sidecar file storing the SHA-256 hash of the Swift source used for the current binary */
export const HASH_PATH = join(BINARY_DIR, "source.hash");

function logError(error: unknown): void {
  console.error("[binary-manager]", error);
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
export function resolveSwiftSourcePath(): string {
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
export async function readSwiftSource(swiftSrc: string): Promise<Buffer> {
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

/** Create the cache directory with restrictive (owner-only) permissions. */
export async function ensureSecureCacheDir(): Promise<void> {
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

/** Lock down a compiled binary so other users on the host cannot read or execute it. */
export async function lockdownBinary(path: string): Promise<void> {
  try {
    await chmod(path, 0o700);
  } catch (err) {
    logError(err);
  }
}

/** Check whether the cached binary at BINARY_PATH is executable. */
export async function isBinaryExecutable(): Promise<boolean> {
  try {
    await access(BINARY_PATH, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify the binary on disk matches the hash recorded for the current source.
 * Returns true on match. Returns false if the hash sidecar is missing or the
 * recorded digest does not match — callers can then trigger a recompile.
 */
export async function verifyBinaryHash(): Promise<boolean> {
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
