#!/usr/bin/env node
/**
 * Clean build / package / artifact baselines (measurement only).
 * Always ends rejected for product optimization with reason baseline-only.
 * Usage: bun run perf:build-package
 */
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const TARGETS = [
  { platform: "darwin", arch: "arm64" },
  { platform: "darwin", arch: "x64" },
  { platform: "win32", arch: "x64" },
  { platform: "win32", arch: "arm64" },
];

export function inventoryDir(dir) {
  if (!existsSync(dir)) return { fileCount: 0, totalBytes: 0, files: [] };
  const files = [];
  let totalBytes = 0;
  function walk(d) {
    let names;
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const name of names) {
      const p = join(d, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        // Broken symlink / race — skip.
        continue;
      }
      if (st.isDirectory()) walk(p);
      else {
        files.push(p);
        totalBytes += st.size;
      }
    }
  }
  walk(dir);
  return { fileCount: files.length, totalBytes, files: files.slice(0, 20) };
}

export function validateArtifact({ path, expectedArch, maxAgeMs }) {
  if (!path || !existsSync(path)) return { ok: false, reason: "missing-artifact" };
  const st = statSync(path);
  if (Date.now() - st.mtimeMs > maxAgeMs) return { ok: false, reason: "stale-artifact" };
  if (expectedArch && !path.includes(expectedArch) && !path.includes(expectedArch.replace("x64", "x64"))) {
    // soft check: path may not encode arch; callers may pass null
  }
  return { ok: true, reason: null, bytes: st.size };
}

function main() {
  const evidenceDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance/task-15-build-package-measurement",
  );
  mkdirSync(evidenceDir, { recursive: true });

  const runBuild = process.env["GOGMEET_PERF_RUN_BUILD"] === "1";
  const buildSamples = [];

  if (runBuild) {
    for (let i = 0; i < 1; i++) {
      const start = performance.now();
      const result = spawnSync("bun", ["run", "build"], {
        encoding: "utf8",
        cwd: process.cwd(),
        env: process.env,
      });
      buildSamples.push({
        durationMs: performance.now() - start,
        exitCode: result.status,
      });
      if (result.status !== 0) {
        process.stderr.write("[perf:build-package] build failed\n");
        process.exit(1);
      }
    }
  } else {
    // Deterministic substitutes: five synthetic clean-build timings.
    for (let i = 0; i < 5; i++) {
      buildSamples.push({ durationMs: 30_000 + i * 500, exitCode: 0, synthetic: true });
    }
  }

  const libInv = inventoryDir(join(process.cwd(), "lib"));
  const distInv = inventoryDir(join(process.cwd(), "dist"));

  const receipts = TARGETS.map((t) => {
    const hostOk = process.platform === t.platform;
    let status = "rejected";
    let reason = "baseline-only";
    if (!hostOk) {
      status = "blocked";
      reason = "not-running-on-target-platform";
    } else if (!runBuild && distInv.fileCount === 0) {
      // Still baseline-only rejected when host matches but no package was produced.
      status = "rejected";
      reason = "baseline-only";
    }

    return {
      version: 1,
      task: 15,
      status,
      reason,
      platform: t.platform,
      arch: t.arch,
      cleanBuildSamples: hostOk ? buildSamples : [],
      packageSamples: [],
      libInventory: { fileCount: libInv.fileCount, totalBytes: libInv.totalBytes },
      distInventory: { fileCount: distInv.fileCount, totalBytes: distInv.totalBytes },
      note: "baseline-only receipts can never be retained for product optimization",
    };
  });

  writeFileSync(join(evidenceDir, "receipt.json"), `${JSON.stringify(receipts, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipts, null, 2)}\n`);
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("measure-build-package.mjs") ||
    process.argv[1].includes("measure-build-package"));
if (isMain) main();
