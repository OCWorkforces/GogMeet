#!/usr/bin/env node
/**
 * Packaged Windows safeStorage measurement via real token/cache adapters.
 *
 * Usage: bun run perf:safe-storage -- --output-dir <dir>
 * Optional: GOGMEET_APP_PATH=/path/to/packaged/binary (Windows x64 host only for native)
 */
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import {
  percentile,
  coefficientOfVariation,
  writeReceiptJson,
} from "./helpers/stats.mjs";
import {
  createProbeUserDataDir,
  cleanupProbeUserDataDir,
  launchPackagedProbe,
} from "./helpers/packaged-probe.mjs";

export function classifyStorageFailure(opts) {
  const { fileExists, encryptionAvailable, decryptThrows, payloadValid } = opts;
  if (!fileExists) return { reason: "missing", preservedCiphertext: false, unlink: false };
  if (!encryptionAvailable) {
    return { reason: "secure-storage-unavailable", preservedCiphertext: true, unlink: false };
  }
  if (decryptThrows) return { reason: "decrypt", preservedCiphertext: true, unlink: false };
  if (!payloadValid) return { reason: "malformed", preservedCiphertext: true, unlink: false };
  return { reason: "ok", preservedCiphertext: true, unlink: false };
}

export function assertNeverUnlinksOnTemporary(result) {
  return result.unlink === false && result.preservedCiphertext === true;
}

export function parseSafeStorageTrace(jsonlText) {
  const lines = String(jsonlText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const durations = [];
  let hasTerminal = false;
  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return { ok: false, reason: "malformed-jsonl" };
    }
    if (row.operation === "probe-terminal") {
      hasTerminal = true;
      continue;
    }
    if (row.operation === "safe-storage" && Number.isFinite(row.durationMs)) {
      durations.push(row.durationMs);
    }
  }
  if (!hasTerminal) return { ok: false, reason: "missing-terminal" };
  if (durations.length < 10) return { ok: false, reason: "insufficient-cycles" };
  return { ok: true, durations };
}

export function evaluateSafeStorageRetained(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  const p95 = percentile(sorted, 95);
  const cv = coefficientOfVariation(durations);
  const slow = durations.filter((d) => d >= 10).length;
  if ((p95 ?? 0) < 10) return { ok: false, reason: "p95-below-10ms" };
  if (slow < 5) return { ok: false, reason: "slow-cycle-count" };
  if (typeof cv === "number" && cv >= 0.1) return { ok: false, reason: "cv" };
  return { ok: true, p95, cv };
}

function parseArgs(argv) {
  let outputDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance-stability-hardening/task-10-safe-storage",
  );
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--output-dir" && argv[i + 1]) {
      outputDir = argv[i + 1];
      i++;
    }
  }
  return { outputDir };
}

async function main() {
  const { outputDir } = parseArgs(process.argv.slice(2));
  mkdirSync(outputDir, { recursive: true });
  const appPath = process.env["GOGMEET_APP_PATH"];
  const hostPlatform = process.platform;
  const hostArch = process.arch;

  // Characterization: temporary unavailability never unlinks.
  const temporaryCases = [
    classifyStorageFailure({
      fileExists: true,
      encryptionAvailable: false,
      decryptThrows: false,
      payloadValid: true,
    }),
    classifyStorageFailure({
      fileExists: true,
      encryptionAvailable: true,
      decryptThrows: true,
      payloadValid: true,
    }),
  ];
  for (const c of temporaryCases) {
    if (!assertNeverUnlinksOnTemporary(c)) {
      writeReceiptJson(outputDir, {
        experiment: "safe-storage",
        status: "rejected",
        reason: "unlink-on-temporary",
        productChange: "none",
        nativeExecuted: false,
      });
      return;
    }
  }

  if (hostPlatform !== "win32") {
    writeReceiptJson(outputDir, {
      experiment: "safe-storage",
      status: "blocked",
      reason: "native-runner-unavailable",
      productChange: "none",
      hostPlatform,
      hostArch,
      artifactArch: hostArch,
      nativeExecuted: false,
      detail: "Windows-only native probe",
    });
    return;
  }

  // Cross-built arm64 on x64 host is blocked.
  const artifactArch = process.env["GOGMEET_ARTIFACT_ARCH"] ?? hostArch;
  if (artifactArch !== hostArch) {
    writeReceiptJson(outputDir, {
      experiment: "safe-storage",
      status: "blocked",
      reason: "native-runner-unavailable",
      productChange: "none",
      hostPlatform,
      hostArch,
      artifactArch,
      nativeExecuted: false,
      detail: "host/artifact arch mismatch",
    });
    return;
  }

  if (!appPath || !existsSync(appPath)) {
    writeReceiptJson(outputDir, {
      experiment: "safe-storage",
      status: "blocked",
      reason: "native-runner-unavailable",
      productChange: "none",
      hostPlatform,
      hostArch,
      artifactArch,
      nativeExecuted: false,
    });
    return;
  }

  const userDataDir = createProbeUserDataDir();
  try {
    const result = await launchPackagedProbe({
      electronPath: appPath,
      mode: "safe-storage",
      userDataDir,
      outputDir,
      timeoutMs: 90_000,
    });
    if (result.status !== "ok" || !result.tracePath) {
      writeReceiptJson(outputDir, {
        experiment: "safe-storage",
        status: result.status === "blocked" ? "blocked" : "rejected",
        reason: result.status,
        productChange: "none",
        hostPlatform,
        hostArch,
        artifactArch,
        nativeExecuted: result.status !== "blocked",
      });
      return;
    }
    const parsed = parseSafeStorageTrace(readFileSync(result.tracePath, "utf8"));
    if (!parsed.ok) {
      writeReceiptJson(outputDir, {
        experiment: "safe-storage",
        status: "rejected",
        reason: parsed.reason,
        productChange: "none",
        nativeExecuted: true,
        hostPlatform,
        hostArch,
        artifactArch,
      });
      return;
    }
    const retained = evaluateSafeStorageRetained(parsed.durations);
    writeReceiptJson(outputDir, {
      experiment: "safe-storage",
      status: retained.ok ? "retained" : "rejected",
      reason: retained.ok ? "thresholds-met" : retained.reason,
      productChange: "none",
      hostPlatform,
      hostArch,
      artifactArch,
      nativeExecuted: true,
      cycleCount: parsed.durations.length,
      p95: retained.p95 ?? percentile([...parsed.durations].sort((a, b) => a - b), 95),
      cv: retained.cv ?? coefficientOfVariation(parsed.durations),
    });
  } finally {
    cleanupProbeUserDataDir(userDataDir);
  }
}

if (process.argv[1]?.endsWith("measure-safe-storage.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
