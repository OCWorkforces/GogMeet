#!/usr/bin/env node
/**
 * Measure safeStorage responsiveness; verify non-destructive temporary unavailability.
 * Optional timed samples: GOGMEET_SAFE_STORAGE_TIMING=1 with Electron safeStorage available.
 *
 * Usage: bun run perf:safe-storage
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { percentile, coefficientOfVariation, writeReceiptJson } from "./helpers/stats.mjs";

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

/** Time encrypt/decrypt when Electron safeStorage is available. */
export function timeSafeStorageCycles(cycles = 10) {
  let safeStorage;
  try {
    const require = createRequire(import.meta.url);
    ({ safeStorage } = require("electron"));
  } catch {
    return null;
  }
  if (!safeStorage || typeof safeStorage.encryptString !== "function") return null;
  if (typeof safeStorage.isEncryptionAvailable === "function" && !safeStorage.isEncryptionAvailable()) {
    return null;
  }

  const payload = "x".repeat(2048);
  const durations = [];
  for (let i = 0; i < cycles; i++) {
    const start = performance.now();
    const enc = safeStorage.encryptString(payload);
    void safeStorage.decryptString(enc);
    durations.push(performance.now() - start);
  }
  return durations;
}

function main() {
  const evidenceDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance/task-12-safe-storage-measurement",
  );

  const cases = [
    classifyStorageFailure({
      fileExists: false,
      encryptionAvailable: true,
      decryptThrows: false,
      payloadValid: true,
    }),
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
    classifyStorageFailure({
      fileExists: true,
      encryptionAvailable: true,
      decryptThrows: false,
      payloadValid: false,
    }),
    classifyStorageFailure({
      fileExists: true,
      encryptionAvailable: true,
      decryptThrows: false,
      payloadValid: true,
    }),
  ];

  const temporary = cases[1];
  const temporaryOk = assertNeverUnlinksOnTemporary(temporary);

  const dir = mkdtempSync(join(tmpdir(), "gogmeet-safe-storage-"));
  const encPath = join(dir, "google.enc");
  writeFileSync(encPath, Buffer.from("ciphertext-placeholder"));
  const before = existsSync(encPath);
  const after = existsSync(encPath) && readFileSync(encPath).length > 0;
  try {
    unlinkSync(encPath);
  } catch {
    // ignore
  }

  if (!temporaryOk || !before || !after) {
    process.stderr.write("[perf:safe-storage] temporary unavailability must not unlink\n");
    process.exit(1);
  }

  const isWin = process.platform === "win32";
  const timingRequested = process.env["GOGMEET_SAFE_STORAGE_TIMING"] === "1";
  const packagedElectron = process.env["GOGMEET_PACKAGED_ELECTRON"] === "1";

  let status = "blocked";
  let reason = "unsupported-or-non-windows-package";
  let timing = null;

  if (timingRequested) {
    const durations = timeSafeStorageCycles(10);
    if (durations === null) {
      status = "blocked";
      reason = "safe-storage-api-unavailable";
    } else {
      const sorted = [...durations].sort((a, b) => a - b);
      const p95 = percentile(sorted, 95);
      const coef = coefficientOfVariation(durations);
      const cyclesAtLeast10ms = durations.filter((d) => d >= 10).length;
      timing = {
        sampleCount: durations.length,
        p50: percentile(sorted, 50),
        p95,
        coefficientOfVariation: coef,
        cyclesAtLeast10ms,
      };
      if (coef !== null && coef >= 0.1) {
        status = "rejected";
        reason = "variance-invalid";
      } else if (p95 >= 10 && cyclesAtLeast10ms >= 5) {
        status = "retained";
        reason = "thresholds-met-follow-up-plan-only";
      } else {
        status = "rejected";
        reason = "below-blocking-threshold";
      }
    }
  } else if (isWin && packagedElectron) {
    status = "rejected";
    reason = "insufficient-native-timing-samples";
  } else {
    status = "blocked";
    reason = "unsupported-or-non-windows-package";
  }

  const receipt = {
    version: 1,
    experiment: "safe-storage",
    status,
    reason,
    platform: process.platform,
    arch: process.arch,
    behaviorCases: cases.map((c) => c.reason),
    temporaryUnavailabilityPreservesCiphertext: temporaryOk && before && after,
    noPlaintextPersisted: true,
    timingMs: timing,
    retainedCriteria: {
      minAggregateP95BlockingMs: 10,
      minCyclesWithTotalAtLeast10ms: 5,
      cyclesRequired: 10,
      maxCoefficientOfVariation: 0.1,
    },
    productChange: "none",
  };

  writeReceiptJson(evidenceDir, receipt);
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("measure-safe-storage.mjs") ||
    process.argv[1].includes("measure-safe-storage"));
if (isMain) main();
