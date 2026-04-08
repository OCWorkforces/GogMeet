import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";

import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = join(fileURLToPath(import.meta.url), "..");

/** Path to bundled Swift source file */
const SWIFT_SRC_DEV = join(
  __dirname,
  "..",
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

export async function computeSwiftSourceHash(
  swiftSrc: string,
): Promise<string> {
  const content = await readFile(swiftSrc);
  return createHash("sha256").update(content).digest("hex");
}

/** Compile the Swift EventKit helper if not already compiled */
export async function ensureBinary(): Promise<void> {
  // Locate Swift source
  // IMPORTANT: swiftc cannot read files from inside ASAR archives.
  // We must use the unpacked version when running from ASAR.
  // electron-builder.yml has asarUnpack configured for this file.
  const swiftSrc = isPackaged
    ? join(
        process.resourcesPath,
        "app.asar.unpacked",
        "src",
        "main",
        "googlemeet-events.swift",
      )
    : SWIFT_SRC_DEV;

  await mkdir(BINARY_DIR, { recursive: true });

  // Compute hash of current Swift source
  const currentHash = await computeSwiftSourceHash(swiftSrc);

  // Check if binary exists AND hash matches
  try {
    await access(BINARY_PATH, constants.X_OK);
    const storedHash = await readFile(HASH_PATH, "utf-8").catch(() => "");
    if (storedHash.trim() === currentHash) {
      return; // binary is up-to-date
    }
    // Hash changed — delete stale binary and recompile
    console.log("[calendar] Swift source changed — recompiling binary");
    await unlink(BINARY_PATH).catch(() => {});
  } catch {
    // Binary doesn't exist — need to compile
  }

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
    await execFileAsync("swiftc", swiftFlags, { timeout: 60_000 });
  } catch {
    // Fallback with explicit SDK path (for some CI environments)
    await execFileAsync(
      "swiftc",
      [
        ...swiftFlags,
        "-sdk",
        "/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk",
      ],
      { timeout: 60_000 },
    );
  }

  // Strip debug symbols from compiled binary for smaller size
  try {
    await execFileAsync("strip", ["-x", "-S", BINARY_PATH], { timeout: 5_000 });
  } catch {
    // Stripping is optional - binary will still work if this fails
  }

  // Store hash for future comparisons
  await writeFile(HASH_PATH, currentHash, "utf-8");
}

/** Run the compiled Swift EventKit helper and return raw output */
export async function runSwiftHelper(): Promise<string> {
  await ensureBinary();
  try {
    const { stdout } = await execFileAsync(BINARY_PATH, [], {
      timeout: 15_000,
    });
    return stdout.trim();
  } catch (err) {
    // Binary may be corrupted or incompatible — force recompile and retry once
    console.warn("[calendar] Swift binary failed, recompiling...");
    try {
      await unlink(BINARY_PATH).catch(() => {});
      await unlink(HASH_PATH).catch(() => {});
      await ensureBinary();
      const { stdout } = await execFileAsync(BINARY_PATH, [], {
        timeout: 15_000,
      });
      return stdout.trim();
    } catch (retryErr) {
      console.error("[calendar] Swift binary recompile failed:", retryErr);
      throw retryErr;
    }
  }
}
