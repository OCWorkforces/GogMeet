#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ReleaseVerificationError,
  assertCodesignDisplay,
  assertEntitlements,
  assertSwiftHelperResult,
  inventoryReleaseArtifacts,
} from "./macos-release-verifier-helpers.mjs";
import { verifyReleaseArtifacts } from "./macos-release-verifier-native.mjs";

export {
  assertCodesignDisplay,
  assertEntitlements,
  assertSwiftHelperResult,
  inventoryReleaseArtifacts,
};

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function parsePackageInfo(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ReleaseVerificationError(`Unable to parse package.json: ${message}`);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed["productName"] !== "string" ||
    typeof parsed["version"] !== "string"
  ) {
    throw new ReleaseVerificationError("package.json must provide string productName and version");
  }
  return { productName: parsed["productName"], version: parsed["version"] };
}

export async function runVerification(options = {}) {
  const rootDir = options.rootDir ?? ROOT_DIR;
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") {
    throw new ReleaseVerificationError("macOS release verification must run on macOS");
  }
  const readText = options.readText ?? readFile;
  const readDirectory = options.readDirectory ?? readdir;
  const verifyArtifacts = options.verifyArtifacts ?? verifyReleaseArtifacts;
  const packageInfo = parsePackageInfo(await readText(join(rootDir, "package.json"), "utf8"));
  const distDir = options.distDir ?? join(rootDir, "dist");
  const artifacts = inventoryReleaseArtifacts(await readDirectory(distDir), packageInfo);
  await verifyArtifacts({ artifacts, distDir, packageInfo });
}

const invokedDirectly =
  typeof process.argv[1] === "string" && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  runVerification().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${message}`);
    process.exitCode = 1;
  });
}
