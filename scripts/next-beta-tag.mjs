#!/usr/bin/env node
/**
 * Compute the next beta git tag for GogMeet.
 *
 * Usage:
 *   node scripts/next-beta-tag.mjs [--base 1.16.0] [--tags $'v1.16.0-beta-1\nv1.16.0-beta-3']
 *
 * Prints JSON: { base, betaNumber, tag, appVersion }
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  let base = null;
  let tagsRaw = "";
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") {
      base = argv[++i];
    } else if (a === "--tags") {
      tagsRaw = argv[++i] ?? "";
    }
  }
  return { base, tagsRaw };
}

function baseFromPackageJson() {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  return String(pkg.version).split("-")[0];
}

export function computeNextBeta(base, tagList) {
  if (!/^\d+\.\d+\.\d+$/.test(base)) {
    throw new Error(`base must be X.Y.Z, got: ${base}`);
  }
  const prefix = `v${base}-beta-`;
  let max = 0;
  for (const line of String(tagList).split(/\r?\n/)) {
    const tag = line.trim().replace(/^refs\/tags\//, "").replace(/\^\{\}$/, "");
    if (!tag.startsWith(prefix)) continue;
    const n = tag.slice(prefix.length);
    if (/^\d+$/.test(n)) {
      const num = Number(n);
      if (num > max) max = num;
    }
  }
  const betaNumber = max + 1;
  return {
    base,
    betaNumber,
    tag: `${prefix}${betaNumber}`,
    appVersion: `${base}-beta.${betaNumber}`,
  };
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const { base: baseArg, tagsRaw } = parseArgs(process.argv);
  const base = baseArg ?? baseFromPackageJson();
  const result = computeNextBeta(base, tagsRaw);
  process.stdout.write(JSON.stringify(result) + "\n");
}
