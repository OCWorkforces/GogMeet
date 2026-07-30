#!/usr/bin/env node
/**
 * Fixed-exclusion workspace fingerprint for F1–F4 receipts.
 * Reviewers cannot choose exclusions.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXCLUDE_PREFIXES = [
  ".omo/evidence/",
  "lib/",
  "dist/",
  "coverage/",
  "node_modules/",
];
const EXCLUDE_EXACT = new Set([".eslintcache"]);
const EXCLUDE_SUFFIXES = [".tsbuildinfo"];

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function isExcluded(path) {
  const normalized = path.replaceAll("\\", "/");
  if (EXCLUDE_EXACT.has(normalized)) return true;
  for (const p of EXCLUDE_PREFIXES) {
    if (normalized.startsWith(p) || normalized.includes(`/${p}`)) return true;
  }
  for (const s of EXCLUDE_SUFFIXES) {
    if (normalized.endsWith(s)) return true;
  }
  // also match .omo/evidence/** glob-style
  if (normalized.includes(".omo/evidence/")) return true;
  return false;
}

function main() {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const diff = execFileSync("git", ["diff", "--binary", "HEAD"], {
    encoding: "buffer",
    maxBuffer: 50 * 1024 * 1024,
  });
  const trackedDiffSha = sha256Hex(diff);

  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  )
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((p) => !isExcluded(p))
    .sort();

  const parts = [];
  for (const rel of untracked) {
    try {
      const abs = resolve(process.cwd(), rel);
      const content = readFileSync(abs);
      parts.push(`${rel}\n${sha256Hex(content)}\n`);
    } catch {
      parts.push(`${rel}\nMISSING\n`);
    }
  }
  const untrackedManifestSha = sha256Hex(Buffer.from(parts.join(""), "utf8"));

  const out = {
    HEAD: head,
    trackedDiffSha256: trackedDiffSha,
    untrackedManifestSha256: untrackedManifestSha,
    untrackedCount: untracked.length,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main();
