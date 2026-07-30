import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { writeFile, chmod, unlink, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

/**
 * Hoisted spawn control: default to real child_process.spawn so existing
 * fixture tests keep working; individual cases override with mock children
 * or synchronous throws for hard-to-reach branches.
 */
const spawnControl = vi.hoisted(() => {
  let realSpawn: ((...args: unknown[]) => unknown) | null = null;
  const spawnMock = vi.fn((...args: unknown[]) => {
    if (!realSpawn) {
      throw new Error("real spawn not installed yet");
    }
    return realSpawn(...args);
  });

  return {
    spawnMock,
    setRealSpawn(fn: (...args: unknown[]) => unknown): void {
      realSpawn = fn;
    },
    useRealSpawn(): void {
      spawnMock.mockImplementation((...args: unknown[]) => {
        if (!realSpawn) {
          throw new Error("real spawn not installed yet");
        }
        return realSpawn(...args);
      });
    },
    useMockChild(child: unknown): void {
      spawnMock.mockImplementation(() => child);
    },
    useSpawnThrow(err: unknown): void {
      spawnMock.mockImplementation(() => {
        throw err;
      });
    },
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  spawnControl.setRealSpawn(actual.spawn as unknown as (...args: unknown[]) => unknown);
  spawnControl.useRealSpawn();
  return {
    ...actual,
    spawn: spawnControl.spawnMock,
  };
});

import {
  runSwiftHelperProcess,
  SWIFT_HELPER_STDOUT_LIMIT_BYTES,
  SWIFT_HELPER_STDERR_LIMIT_BYTES,
  SWIFT_HELPER_TIMEOUT_MS,
  SWIFT_HELPER_KILL_GRACE_MS,
  SwiftHelperProcessError,
  isIntegritySpawnFailure,
} from "../../../src/main/swift/swift-helper-process.js";

const tempDirs: string[] = [];
const tempFiles: string[] = [];

beforeEach(() => {
  spawnControl.useRealSpawn();
});

afterEach(async () => {
  spawnControl.useRealSpawn();
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

/** Minimal duplex child used to exercise runner branches without a real binary. */
function createMockChild(): ChildProcessWithoutNullStreams & {
  stdout: EventEmitter;
  stderr: EventEmitter;
} {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    killed: boolean;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = ((signal?: NodeJS.Signals | number) => {
    child.killed = true;
    queueMicrotask(() => {
      child.emit(
        "close",
        signal === "SIGKILL" ? null : 1,
        typeof signal === "string" ? signal : null,
      );
    });
    return true;
  }) as ChildProcessWithoutNullStreams["kill"];
  return child;
}

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
    expect(SWIFT_HELPER_KILL_GRACE_MS).toBe(5_000);
  });

  it("rejects immediately when AbortSignal is already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("pre-aborted");
    reason.name = "TimeoutError";
    controller.abort(reason);

    await expect(
      runSwiftHelperProcess({
        binaryPath: process.execPath,
        args: ["-e", "process.exit(0)"],
        signal: controller.signal,
        timeoutMs: 2_000,
      }),
    ).rejects.toMatchObject({
      failureKind: "abort",
      message: expect.stringContaining("TimeoutError"),
    });
  });

  // Windows does not deliver POSIX signals to Node children the same way
  // (process.kill(pid, "SIGTERM") often surfaces as a plain exit). Signal
  // classification is covered cross-platform via the mock close path below.
  it.skipIf(process.platform === "win32")(
    "surfaces signal failures when a real child is killed with SIGTERM",
    async () => {
      const path = await writeNodeFixture(`
      process.kill(process.pid, "SIGTERM");
      setInterval(() => {}, 1000);
    `);
      await expect(
        runSwiftHelperProcess({
          binaryPath: process.execPath,
          args: [path],
          timeoutMs: 5_000,
          killGraceMs: 50,
        }),
      ).rejects.toMatchObject({
        failureKind: "signal",
        signal: "SIGTERM",
      });
    },
  );

  it("classifies close-with-signal as signal failure (cross-platform)", async () => {
    const child = createMockChild();
    spawnControl.useMockChild(child);

    const promise = runSwiftHelperProcess({
      binaryPath: "/mock-helper",
      timeoutMs: 2_000,
      killGraceMs: 10,
    });

    child.emit("close", null, "SIGTERM");

    await expect(promise).rejects.toMatchObject({
      failureKind: "signal",
      signal: "SIGTERM",
    });
  });

  it("classifies ENOEXEC as integrity spawn failure and rejects non-spawn kinds", () => {
    expect(isIntegritySpawnFailure({ failureKind: "spawn", spawnCode: "ENOEXEC" })).toBe(true);
    expect(isIntegritySpawnFailure({ failureKind: "spawn", spawnCode: "EACCES" })).toBe(false);
    expect(isIntegritySpawnFailure({ failureKind: "spawn", spawnCode: undefined })).toBe(false);
    expect(isIntegritySpawnFailure({ failureKind: "exit", spawnCode: "ENOENT" })).toBe(false);
    expect(isIntegritySpawnFailure({ failureKind: "timeout", spawnCode: "ENOENT" })).toBe(false);
  });

  it("maps synchronous spawn throw with errno code to spawn failure", async () => {
    spawnControl.useSpawnThrow(Object.assign(new Error("sync spawn denied"), { code: "EACCES" }));

    await expect(
      runSwiftHelperProcess({
        binaryPath: "/tmp/gogmeet-not-used",
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({
      failureKind: "spawn",
      spawnCode: "EACCES",
      message: "sync spawn denied",
    });
  });

  it("maps synchronous non-Error spawn throw without code", async () => {
    spawnControl.useSpawnThrow("raw-spawn-failure");

    await expect(
      runSwiftHelperProcess({
        binaryPath: "/tmp/gogmeet-not-used",
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({
      failureKind: "spawn",
      spawnCode: undefined,
      message: "Swift helper spawn failed",
    });
  });

  it("accepts string stream chunks and resolves on exit 0", async () => {
    const child = createMockChild();
    spawnControl.useMockChild(child);

    const promise = runSwiftHelperProcess({
      binaryPath: "/mock-helper",
      timeoutMs: 2_000,
      killGraceMs: 20,
    });

    child.stdout.emit("data", "hello-");
    child.stdout.emit("data", Buffer.from("world"));
    child.stderr.emit("data", "diag");
    child.emit("close", 0, null);

    await expect(promise).resolves.toEqual({
      stdout: "hello-world",
      stderr: "diag",
      exitCode: 0,
    });
  });

  it("keeps a partial last chunk when stdout overflows mid-buffer", async () => {
    const child = createMockChild();
    spawnControl.useMockChild(child);
    const limit = 8;

    const promise = runSwiftHelperProcess({
      binaryPath: "/mock-helper",
      stdoutLimitBytes: limit,
      timeoutMs: 2_000,
      killGraceMs: 10,
    });

    // 4 bytes ok, then 8-byte chunk only keeps 4 more before overflow.
    child.stdout.emit("data", Buffer.from("abcd"));
    child.stdout.emit("data", Buffer.from("01234567"));
    // Further data after overflow is ignored.
    child.stdout.emit("data", Buffer.from("zzz"));
    child.emit("close", null, "SIGTERM");

    await expect(promise).rejects.toMatchObject({
      failureKind: "stdout-overflow",
      stdout: "abcd0123",
    });
  });

  it("overflows stderr with zero retained bytes when already at the limit", async () => {
    const child = createMockChild();
    spawnControl.useMockChild(child);
    const limit = 4;

    const promise = runSwiftHelperProcess({
      binaryPath: "/mock-helper",
      stderrLimitBytes: limit,
      timeoutMs: 2_000,
      killGraceMs: 10,
    });

    child.stderr.emit("data", Buffer.from("abcd"));
    child.stderr.emit("data", Buffer.from("x"));
    child.stderr.emit("data", Buffer.from("y"));
    child.emit("close", 1, null);

    await expect(promise).rejects.toMatchObject({
      failureKind: "stderr-overflow",
      stderr: "abcd",
    });
  });

  it("maps child error events to spawn failures (including empty messages)", async () => {
    const child = createMockChild();
    spawnControl.useMockChild(child);

    const promise = runSwiftHelperProcess({
      binaryPath: "/mock-helper",
      timeoutMs: 2_000,
      killGraceMs: 10,
    });

    const err = Object.assign(new Error(""), { code: "EAGAIN" });
    child.emit("error", err);
    child.emit("close", null, null);

    await expect(promise).rejects.toMatchObject({
      failureKind: "spawn",
      spawnCode: "EAGAIN",
      message: "Swift helper spawn failed",
    });
  });

  it("reports unknown exit when close fires without code or signal", async () => {
    const child = createMockChild();
    spawnControl.useMockChild(child);

    const promise = runSwiftHelperProcess({
      binaryPath: "/mock-helper",
      timeoutMs: 2_000,
      killGraceMs: 10,
    });

    child.emit("close", null, null);

    await expect(promise).rejects.toMatchObject({
      failureKind: "exit",
      message: expect.stringContaining("unknown"),
      exitCode: undefined,
    });
  });

  it("escalates SIGTERM to SIGKILL after kill grace on timeout", async () => {
    const child = createMockChild();
    const killSignals: Array<NodeJS.Signals | number | undefined> = [];
    child.killed = false;
    child.kill = ((signal?: NodeJS.Signals | number) => {
      killSignals.push(signal);
      // Stay "alive" after SIGTERM so grace timer escalates.
      if (signal === "SIGKILL") {
        child.killed = true;
        queueMicrotask(() => child.emit("close", null, "SIGKILL"));
      }
      return true;
    }) as ChildProcessWithoutNullStreams["kill"];
    spawnControl.useMockChild(child);

    const promise = runSwiftHelperProcess({
      binaryPath: "/mock-helper",
      timeoutMs: 30,
      killGraceMs: 20,
    });

    await expect(promise).rejects.toMatchObject({
      failureKind: "timeout",
    });
    expect(killSignals).toContain("SIGTERM");
    expect(killSignals).toContain("SIGKILL");
  });

  it("defaults args to empty when omitted", async () => {
    const child = createMockChild();
    spawnControl.useMockChild(child);

    const promise = runSwiftHelperProcess({
      binaryPath: "/mock-helper",
      timeoutMs: 1_000,
    });
    child.emit("close", 0, null);
    await expect(promise).resolves.toMatchObject({ exitCode: 0, stdout: "", stderr: "" });

    expect(spawnControl.spawnMock).toHaveBeenCalledWith(
      "/mock-helper",
      [],
      expect.objectContaining({ shell: false }),
    );
  });

  // Keep pathToFileURL referenced so tooling does not flag unused in some envs
  void pathToFileURL;
});

describe("SwiftHelperProcessError", () => {
  it("defaults empty stdout/stderr and omits cause when not provided", () => {
    const err = new SwiftHelperProcessError("exit", "failed", { exitCode: 7 });
    expect(err.stdout).toBe("");
    expect(err.stderr).toBe("");
    expect(err.exitCode).toBe(7);
    expect(err.cause).toBeUndefined();
  });

  it("forwards cause when provided", () => {
    const cause = new Error("root");
    const err = new SwiftHelperProcessError("spawn", "wrapped", { cause });
    expect(err.cause).toBe(cause);
  });
});
