import { describe, it, expect, afterEach } from "vitest";
import { writeFile, chmod, unlink, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import {
  runSwiftHelperProcess,
  SWIFT_HELPER_STDOUT_LIMIT_BYTES,
  SWIFT_HELPER_STDERR_LIMIT_BYTES,
  SWIFT_HELPER_TIMEOUT_MS,
  SwiftHelperProcessError,
  isIntegritySpawnFailure,
} from "../../../src/main/swift/swift-helper-process.js";

const tempDirs: string[] = [];
const tempFiles: string[] = [];

afterEach(async () => {
  for (const f of tempFiles.splice(0)) {
    try {
      await unlink(f);
    } catch {
      // ignore
    }
  }
  for (const d of tempDirs.splice(0)) {
    try {
      await unlink(d);
    } catch {
      // ignore — dir may not be empty; best-effort
    }
  }
});

async function writeNodeFixture(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gogmeet-swift-helper-"));
  tempDirs.push(dir);
  const path = join(dir, "fixture.mjs");
  await writeFile(path, source, "utf-8");
  tempFiles.push(path);
  await chmod(path, 0o755);
  return path;
}

describe("runSwiftHelperProcess", () => {
  it("returns stdout from a successful child (chunked multi-MiB JSONL-like output)", async () => {
    // Generate ~2 MiB of chunked output via a real Node child.
    const line = `${JSON.stringify("id")}\n`;
    const targetBytes = 2 * 1024 * 1024;
    const path = await writeNodeFixture(`
      const line = ${JSON.stringify(line)};
      const target = ${targetBytes};
      let written = 0;
      while (written < target) {
        const n = Math.min(line.length, target - written);
        process.stdout.write(line.slice(0, n));
        written += n;
      }
    `);

    const result = await runSwiftHelperProcess({
      binaryPath: process.execPath,
      args: [path],
      timeoutMs: 10_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThanOrEqual(targetBytes);
    expect(result.stdout.length).toBeLessThanOrEqual(targetBytes + line.length);
  });

  it("succeeds at stdout limit - 1 and limit", async () => {
    const limit = 64 * 1024; // use smaller limit for fast tests of boundary math
    for (const size of [limit - 1, limit]) {
      const path = await writeNodeFixture(`
        process.stdout.write(Buffer.alloc(${size}, 0x61));
      `);
      const result = await runSwiftHelperProcess({
        binaryPath: process.execPath,
        args: [path],
        stdoutLimitBytes: limit,
        timeoutMs: 5_000,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBe(size);
    }
  });

  it("fails at stdout limit + 1 with stdout-overflow and retains bounded bytes", async () => {
    const limit = 32 * 1024;
    const path = await writeNodeFixture(`
      process.stdout.write(Buffer.alloc(${limit + 1}, 0x62));
      // Keep alive briefly so kill path can run
      setTimeout(() => {}, 2000);
    `);
    await expect(
      runSwiftHelperProcess({
        binaryPath: process.execPath,
        args: [path],
        stdoutLimitBytes: limit,
        timeoutMs: 5_000,
        killGraceMs: 50,
      }),
    ).rejects.toMatchObject({
      name: "SwiftHelperProcessError",
      failureKind: "stdout-overflow",
    });
  });

  it("fails at stderr limit + 1 with stderr-overflow", async () => {
    const limit = 8 * 1024;
    const path = await writeNodeFixture(`
      process.stderr.write(Buffer.alloc(${limit + 1}, 0x63));
      setTimeout(() => {}, 2000);
    `);
    await expect(
      runSwiftHelperProcess({
        binaryPath: process.execPath,
        args: [path],
        stderrLimitBytes: limit,
        timeoutMs: 5_000,
        killGraceMs: 50,
      }),
    ).rejects.toMatchObject({
      name: "SwiftHelperProcessError",
      failureKind: "stderr-overflow",
    });
  });

  it("aborts on upstream AbortSignal and settles once", async () => {
    const path = await writeNodeFixture(`
      setInterval(() => process.stdout.write("x"), 20);
    `);
    const controller = new AbortController();
    const promise = runSwiftHelperProcess({
      binaryPath: process.execPath,
      args: [path],
      signal: controller.signal,
      timeoutMs: 10_000,
      killGraceMs: 50,
    });
    setTimeout(() => controller.abort(), 30);
    await expect(promise).rejects.toMatchObject({
      failureKind: "abort",
    });
  });

  it("times out and kills the child", async () => {
    const path = await writeNodeFixture(`
      setInterval(() => {}, 1000);
    `);
    await expect(
      runSwiftHelperProcess({
        binaryPath: process.execPath,
        args: [path],
        timeoutMs: 80,
        killGraceMs: 30,
      }),
    ).rejects.toMatchObject({
      failureKind: "timeout",
    });
  });

  it("classifies spawn ENOENT as integrity spawn failure", async () => {
    try {
      await runSwiftHelperProcess({
        binaryPath: join(tmpdir(), "gogmeet-definitely-missing-binary-xyz"),
        args: [],
        timeoutMs: 2_000,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SwiftHelperProcessError);
      const e = err as SwiftHelperProcessError;
      expect(e.failureKind).toBe("spawn");
      expect(isIntegritySpawnFailure(e)).toBe(true);
    }
  });

  it("surfaces semantic non-zero exit codes without overflow", async () => {
    for (const code of [2, 3, 4]) {
      const path = await writeNodeFixture(`process.exit(${code});`);
      try {
        await runSwiftHelperProcess({
          binaryPath: process.execPath,
          args: [path],
          timeoutMs: 5_000,
        });
        expect.unreachable(`exit ${code} should throw`);
      } catch (err) {
        expect(err).toBeInstanceOf(SwiftHelperProcessError);
        const e = err as SwiftHelperProcessError;
        expect(e.failureKind).toBe("exit");
        expect(e.exitCode).toBe(code);
        expect(isIntegritySpawnFailure(e)).toBe(false);
      }
    }
  });

  it("exports production safety ceilings", () => {
    expect(SWIFT_HELPER_STDOUT_LIMIT_BYTES).toBe(8 * 1024 * 1024);
    expect(SWIFT_HELPER_STDERR_LIMIT_BYTES).toBe(256 * 1024);
    expect(SWIFT_HELPER_TIMEOUT_MS).toBe(15_000);
  });

  // Keep pathToFileURL referenced so tooling does not flag unused in some envs
  void pathToFileURL;
});
