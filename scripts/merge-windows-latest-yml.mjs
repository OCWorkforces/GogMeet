#!/usr/bin/env node
/**
 * Merge electron-builder Windows channel metadata so both x64 and arm64 NSIS
 * installers appear in a single dist/latest.yml (K25).
 *
 * After sequential:
 *   electron-builder --win nsis portable --x64
 *   electron-builder --win nsis portable --arm64
 * the last arch's latest.yml would otherwise overwrite the first.
 *
 * This script rebuilds latest.yml from the NSIS .exe files on disk (sha512 + size),
 * which is what electron-updater needs for multi-arch GitHub releases.
 *
 * Usage:
 *   node scripts/merge-windows-latest-yml.mjs
 *   bun run merge:windows-latest-yml
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");

function readVersion() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
  return String(pkg.version);
}

function sha512File(filePath) {
  const data = readFileSync(filePath);
  return createHash("sha512").update(data).digest("base64");
}

/**
 * @param {string} version
 * @param {string} dir
 * @returns {{ path: string, arch: "x64" | "arm64", sha512: string, size: number }[]}
 */
export function collectNsisArtifacts(version, dir = distDir) {
  const expected = [
    { arch: "x64", name: `GogMeet-${version}-x64.exe` },
    { arch: "arm64", name: `GogMeet-${version}-arm64.exe` },
  ];
  /** @type {{ path: string, arch: "x64" | "arm64", sha512: string, size: number }[]} */
  const out = [];
  for (const item of expected) {
    const full = join(dir, item.name);
    if (!existsSync(full)) {
      throw new Error(`Missing NSIS artifact for merge: ${item.name}`);
    }
    // Skip portable masquerading as same name (portable uses -portable suffix)
    if (item.name.includes("portable")) continue;
    const st = statSync(full);
    out.push({
      path: item.name,
      arch: item.arch,
      sha512: sha512File(full),
      size: st.size,
    });
  }
  return out;
}

/**
 * Build latest.yml contents for electron-updater GitHub provider (Windows).
 * @param {string} version
 * @param {{ path: string, arch: string, sha512: string, size: number }[]} files
 */
export function buildLatestYml(version, files) {
  // Prefer x64 as the primary "path" entry (common client arch); files[] lists both.
  const primary = files.find((f) => f.arch === "x64") ?? files[0];
  if (!primary) {
    throw new Error("No NSIS files to write into latest.yml");
  }

  const lines = [
    `version: ${version}`,
    `files:`,
  ];
  for (const f of files) {
    lines.push(`  - url: ${f.path}`);
    lines.push(`    sha512: ${f.sha512}`);
    lines.push(`    size: ${f.size}`);
  }
  lines.push(`path: ${primary.path}`);
  lines.push(`sha512: ${primary.sha512}`);
  lines.push(`releaseDate: ${new Date().toISOString()}`);
  return lines.join("\n") + "\n";
}

/**
 * @param {{ distDir?: string, version?: string }} opts
 */
export function mergeWindowsLatestYml(opts = {}) {
  const dir = opts.distDir ?? distDir;
  const version = opts.version ?? readVersion();
  const files = collectNsisArtifacts(version, dir);
  const yml = buildLatestYml(version, files);
  const outPath = join(dir, "latest.yml");
  writeFileSync(outPath, yml, "utf-8");
  return { outPath, version, files, yml };
}

function main() {
  try {
    if (!existsSync(distDir)) {
      throw new Error(`dist/ not found at ${distDir}`);
    }
    const result = mergeWindowsLatestYml();
    console.log(
      `[merge-windows-latest-yml] Wrote ${result.outPath} for v${result.version} (${result.files.map((f) => f.path).join(", ")})`,
    );
  } catch (err) {
    console.error(
      "[merge-windows-latest-yml]",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main();
}
