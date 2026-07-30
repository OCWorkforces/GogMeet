import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  classifyStorageFailure,
  assertNeverUnlinksOnTemporary,
} from "../../scripts/performance/measure-safe-storage.mjs";

const script = join(process.cwd(), "scripts/performance/measure-safe-storage.mjs");

describe("perf:safe-storage", () => {
  it("classifies missing, unavailable, decrypt, malformed, ok", () => {
    expect(
      classifyStorageFailure({
        fileExists: false,
        encryptionAvailable: true,
        decryptThrows: false,
        payloadValid: true,
      }).reason,
    ).toBe("missing");
    expect(
      classifyStorageFailure({
        fileExists: true,
        encryptionAvailable: false,
        decryptThrows: false,
        payloadValid: true,
      }).reason,
    ).toBe("secure-storage-unavailable");
    expect(
      classifyStorageFailure({
        fileExists: true,
        encryptionAvailable: true,
        decryptThrows: true,
        payloadValid: true,
      }).reason,
    ).toBe("decrypt");
    expect(
      classifyStorageFailure({
        fileExists: true,
        encryptionAvailable: true,
        decryptThrows: false,
        payloadValid: false,
      }).reason,
    ).toBe("malformed");
    expect(
      classifyStorageFailure({
        fileExists: true,
        encryptionAvailable: true,
        decryptThrows: false,
        payloadValid: true,
      }).reason,
    ).toBe("ok");
  });

  it("temporary unavailability never unlinks", () => {
    const temporary = classifyStorageFailure({
      fileExists: true,
      encryptionAvailable: false,
      decryptThrows: false,
      payloadValid: true,
    });
    expect(assertNeverUnlinksOnTemporary(temporary)).toBe(true);
  });

  it("perf:safe-storage exits 0 with terminal receipt", () => {
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.experiment).toBe("safe-storage");
    expect(receipt.temporaryUnavailabilityPreservesCiphertext).toBe(true);
    expect(["blocked", "rejected", "retained", "skipped"]).toContain(receipt.status);
    expect(receipt.productChange).toBe("none");
  });
});
