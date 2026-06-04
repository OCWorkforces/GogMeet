#!/usr/bin/env node
/**
 * Host Node.js validation for GogMeet.
 *
 * GogMeet is a Bun-first project: Bun runs dev, build, test, and packaging.
 * A handful of contributor workflows still shell out to plain Node — the
 * tray/app icon generator (`scripts/generate-calendar-tray-icons.mjs`) and the
 * release tag step (`node -p "require('./package.json').version"`). Those paths
 * must run on a known-good host Node, separate from the Node version that
 * Electron 42 embeds at runtime (Node 24.15.0).
 *
 * This script enforces "host Node major >= 26" and then runs the icon
 * generator under host Node so CI catches drift early.
 *
 * Usage:
 *   node scripts/validate-node.mjs
 *   NODE_VALIDATE_SKIP_GENERATE=1 node scripts/validate-node.mjs   # skip generator (tests)
 *
 * Exit codes:
 *   0  success
 *   1  host Node major < REQUIRED_MAJOR, or the icon generator failed
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_MAJOR = 26;

/**
 * Parse the major component out of a Node-style semver string.
 * Accepts "26.3.0", "v26.3.0", and similar. Throws on malformed input.
 */
export function parseMajor(version) {
  const match = /^v?(\d+)\./.exec(String(version));
  if (!match) {
    throw new Error(`Cannot parse Node.js version: ${version}`);
  }
  return Number(match[1]);
}

/**
 * Pure version check. Returns { ok: true, major } or { ok: false, error }.
 */
export function validateNodeVersion(version, requiredMajor = REQUIRED_MAJOR) {
  const major = parseMajor(version);
  if (major < requiredMajor) {
    return {
      ok: false,
      error:
        `Host Node.js >= ${requiredMajor} required, found v${version}. ` +
        `Install Node.js ${requiredMajor} (see .nvmrc) before running this script.`,
    };
  }
  return { ok: true, major };
}

/**
 * Resolve the icon generator script next to this file.
 */
export function defaultGeneratorPath() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "generate-calendar-tray-icons.mjs");
}

/**
 * Run the full validation flow. Returns the integer exit code (0 on success).
 * All side effects (spawn, env, version, logger) are injected so the function
 * can be exercised deterministically from tests without spawning subprocesses
 * or depending on a particular host Node version.
 */
export function runValidation(options = {}) {
  const version = options.version ?? process.versions.node;
  const env = options.env ?? process.env;
  const spawn = options.spawn ?? spawnSync;
  const nodeExecPath = options.nodeExecPath ?? process.execPath;
  const generatorPath = options.generatorPath ?? defaultGeneratorPath();
  const logger = options.logger ?? console;

  const check = validateNodeVersion(version);
  if (!check.ok) {
    logger.error(`ERROR: ${check.error}`);
    return 1;
  }
  logger.log(`Host Node.js version: v${version}`);

  if (env["NODE_VALIDATE_SKIP_GENERATE"] === "1") {
    logger.log("OK: host Node.js validation passed (icon generation skipped).");
    return 0;
  }

  const result = spawn(nodeExecPath, [generatorPath], { stdio: "inherit" });
  if (result.error) {
    logger.error(`ERROR: failed to launch icon generator: ${result.error.message}`);
    return 1;
  }
  if (typeof result.status === "number" && result.status !== 0) {
    logger.error(`ERROR: icon generator exited with status ${result.status}`);
    return 1;
  }
  if (result.signal) {
    logger.error(`ERROR: icon generator terminated by signal ${result.signal}`);
    return 1;
  }

  logger.log("OK: host Node.js validation passed and icon generator completed.");
  return 0;
}

// CLI entry: run only when invoked directly (not when imported by tests).
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  process.exit(runValidation());
}
