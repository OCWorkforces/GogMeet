import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { execFileAsyncMock, runSwiftHelperProcessMock } = vi.hoisted(() => ({
  execFileAsyncMock: vi.fn(),
  runSwiftHelperProcessMock: vi.fn(),
}));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const fn = Object.assign(vi.fn(), {
    [promisify.custom]: execFileAsyncMock,
  });
  return { execFile: fn, spawn: vi.fn() };
});
vi.mock("../../src/main/swift/swift-helper-process.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/main/swift/swift-helper-process.js")
  >("../../src/main/swift/swift-helper-process.js");
  return {
    ...actual,
    runSwiftHelperProcess: runSwiftHelperProcessMock,
  };
});

const {
  accessMock,
  mkdirMock,
  readFileMock,
  writeFileMock,
  unlinkMock,
  statMock,
} = vi.hoisted(() => ({
  accessMock: vi.fn(),
  mkdirMock: vi.fn(),
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
  unlinkMock: vi.fn(),
  statMock: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  access: accessMock,
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  unlink: unlinkMock,
  stat: statMock,
}));

async function loadModule() {
  vi.resetModules();
  const [manager, cache] = await Promise.all([
    import("../../src/main/swift/binary-manager.js"),
    import("../../src/main/swift/binary-cache.js"),
  ]);
  return { ...cache, ...manager };
}

const EXPECTED_BINARY_DIR = join(tmpdir(), "googlemeet");
const EXPECTED_BINARY_PATH = join(EXPECTED_BINARY_DIR, "googlemeet-events");
const EXPECTED_HASH_PATH = join(EXPECTED_BINARY_DIR, "source.hash");

const FAKE_SOURCE = Buffer.from("swift-source");

function setReadFileForSourceAndHash(
  sourceBytes: Buffer,
  storedHash: string | null,
): void {
  readFileMock.mockImplementation(async (path: string, _enc?: string) => {
    if (path === EXPECTED_HASH_PATH) {
      if (storedHash === null) {
        throw new Error("ENOENT");
      }
      return storedHash;
    }
    return sourceBytes;
  });
}

async function sha256Hex(bytes: Buffer): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Compile-retry sleeps use real exponential backoff. Collapsing setTimeout to
 * microtasks avoids Windows CI hangs that fake-timer races do not fix reliably.
 */
function mockImmediateSetTimeout(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    handler: TimerHandler,
    _ms?: number,
    ...args: unknown[]
  ) => {
    const handle = {
      unref: () => handle,
      ref: () => handle,
    }.As<ReturnType<typeof setTimeout>>();
    if (typeof handler === "function") {
      queueMicrotask(() => {
        (handler as (...a: unknown[]) => void)(...args);
      });
    }
    return handle;
  }) as typeof setTimeout);
}

beforeEach(() => {
  execFileAsyncMock.mockReset();
  runSwiftHelperProcessMock.mockReset();
  accessMock.mockReset();
  mkdirMock.mockReset();
  readFileMock.mockReset();
  writeFileMock.mockReset();
  unlinkMock.mockReset();
  statMock.mockReset();

  // Default stat: mtime stable across calls so memoization tests are deterministic.
  statMock.mockResolvedValue({ mtimeMs: 1_000 });

  mkdirMock.mockResolvedValue(undefined);
  writeFileMock.mockResolvedValue(undefined);
  unlinkMock.mockResolvedValue(undefined);
  execFileAsyncMock.mockResolvedValue({ stdout: "", stderr: "" });
  runSwiftHelperProcessMock.mockResolvedValue({
    stdout: "",
    stderr: "",
    exitCode: 0,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("BINARY_PATH constant", () => {
  it("is located under the OS temp dir in the googlemeet folder", async () => {
    const mod = await loadModule();
    expect(mod.BINARY_PATH).toBe(EXPECTED_BINARY_PATH);
    expect(mod.BINARY_PATH.startsWith(tmpdir())).toBe(true);
    expect(mod.BINARY_PATH.endsWith("googlemeet-events")).toBe(true);
  });
});

describe("computeSwiftSourceHash", () => {
  it("reads the file and returns a SHA-256 hex digest", async () => {
    readFileMock.mockResolvedValueOnce(FAKE_SOURCE);
    const mod = await loadModule();

    const result = await mod.computeSwiftSourceHash("/tmp/some-source.swift");

    const expected = await sha256Hex(FAKE_SOURCE);
    expect(result).toBe(expected);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileMock).toHaveBeenCalledWith("/tmp/some-source.swift");
  });

  it("produces different hashes for different content", async () => {
    const mod = await loadModule();

    readFileMock.mockResolvedValueOnce(Buffer.from("aaa"));
    const h1 = await mod.computeSwiftSourceHash("/a");

    readFileMock.mockResolvedValueOnce(Buffer.from("bbb"));
    const h2 = await mod.computeSwiftSourceHash("/b");

    expect(h1).not.toBe(h2);
  });
});

describe("ensureBinary", () => {
  it("returns early (cache hit) when binary exists and stored hash matches", async () => {
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    accessMock.mockResolvedValueOnce(undefined);

    const mod = await loadModule();
    await mod.ensureBinary();

    expect(mkdirMock).toHaveBeenCalledWith(EXPECTED_BINARY_DIR, {
      recursive: true,
      mode: 0o700,
    });
    expect(unlinkMock).not.toHaveBeenCalled();
    expect(execFileAsyncMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("recompiles when stored hash differs from current source hash", async () => {
    setReadFileForSourceAndHash(FAKE_SOURCE, "stale-hash-value");
    accessMock.mockResolvedValueOnce(undefined);

    const mod = await loadModule();
    await mod.ensureBinary();

    expect(unlinkMock).toHaveBeenCalledWith(EXPECTED_BINARY_PATH);
    expect(execFileAsyncMock).toHaveBeenCalledTimes(2);
    expect(execFileAsyncMock.mock.calls[0][0]).toBe("swiftc");
    expect(execFileAsyncMock.mock.calls[1][0]).toBe("strip");
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    expect(writeFileMock).toHaveBeenCalledWith(
      EXPECTED_HASH_PATH,
      expectedHash,
      "utf-8",
    );
  });

  it("compiles fresh when binary does not exist", async () => {
    setReadFileForSourceAndHash(FAKE_SOURCE, null);
    accessMock.mockRejectedValueOnce(new Error("ENOENT"));

    const mod = await loadModule();
    await mod.ensureBinary();

    expect(unlinkMock).not.toHaveBeenCalled();
    expect(execFileAsyncMock).toHaveBeenCalledTimes(2);
    const [cmd, args] = execFileAsyncMock.mock.calls[0];
    expect(cmd).toBe("swiftc");
    expect(args).toContain("-o");
    expect(args).toContain(EXPECTED_BINARY_PATH);
    expect(writeFileMock).toHaveBeenCalledWith(
      EXPECTED_HASH_PATH,
      await sha256Hex(FAKE_SOURCE),
      "utf-8",
    );
  });

  it("uses arm64 target on Apple Silicon", async () => {
    vi.stubGlobal("process", { ...process, arch: "arm64" });
    setReadFileForSourceAndHash(FAKE_SOURCE, null);
    accessMock.mockRejectedValueOnce(new Error("ENOENT"));

    const mod = await loadModule();
    await mod.ensureBinary();

    const swiftCall = execFileAsyncMock.mock.calls.find(
      (c) => c[0] === "swiftc",
    );
    expect(swiftCall).toBeDefined();
    const args = swiftCall![1] as string[];
    const tIdx = args.indexOf("-target");
    expect(args[tIdx + 1]).toBe("arm64-apple-macosx11.0");
  });

  it("uses x86_64 target on Intel architecture", async () => {
    vi.stubGlobal("process", { ...process, arch: "x64" });
    setReadFileForSourceAndHash(FAKE_SOURCE, null);
    accessMock.mockRejectedValueOnce(new Error("ENOENT"));

    const mod = await loadModule();
    await mod.ensureBinary();

    const swiftCall = execFileAsyncMock.mock.calls.find(
      (c) => c[0] === "swiftc",
    );
    expect(swiftCall).toBeDefined();
    const args = swiftCall![1] as string[];
    const tIdx = args.indexOf("-target");
    expect(args[tIdx + 1]).toBe("x86_64-apple-macosx11.0");
  });

  it("includes -Osize and -whole-module-optimization flags", async () => {
    setReadFileForSourceAndHash(FAKE_SOURCE, null);
    accessMock.mockRejectedValueOnce(new Error("ENOENT"));

    const mod = await loadModule();
    await mod.ensureBinary();

    const args = execFileAsyncMock.mock.calls[0][1] as string[];
    expect(args).toContain("-Osize");
    expect(args).toContain("-whole-module-optimization");
  });

  it("retries swiftc with explicit SDK path when the first compile fails", async () => {
    setReadFileForSourceAndHash(FAKE_SOURCE, null);
    accessMock.mockRejectedValueOnce(new Error("ENOENT"));

    execFileAsyncMock
      .mockRejectedValueOnce(new Error("swift: command failed"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    const mod = await loadModule();
    await mod.ensureBinary();

    expect(execFileAsyncMock).toHaveBeenCalledTimes(3);
    const retryArgs = execFileAsyncMock.mock.calls[1][1] as string[];
    expect(execFileAsyncMock.mock.calls[1][0]).toBe("swiftc");
    expect(retryArgs).toContain("-sdk");
    const sdkIdx = retryArgs.indexOf("-sdk");
    expect(retryArgs[sdkIdx + 1]).toBe(
      "/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk",
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      EXPECTED_HASH_PATH,
      await sha256Hex(FAKE_SOURCE),
      "utf-8",
    );
  });

  it("propagates error if both swiftc attempts fail", async () => {
    const setTimeoutSpy = mockImmediateSetTimeout();
    try {
      setReadFileForSourceAndHash(FAKE_SOURCE, null);
      accessMock.mockRejectedValueOnce(new Error("ENOENT"));

      // 5 retry attempts × 2 swiftc calls (primary + SDK fallback) = 10 rejections
      for (let i = 0; i < 9; i++) {
        execFileAsyncMock.mockRejectedValueOnce(new Error(`swiftc fail ${i}`));
      }
      execFileAsyncMock.mockRejectedValueOnce(new Error("second swiftc failed"));

      const mod = await loadModule();
      await expect(mod.ensureBinary()).rejects.toThrow("second swiftc failed");
      expect(writeFileMock).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("succeeds even if strip fails (stripping is optional)", async () => {
    setReadFileForSourceAndHash(FAKE_SOURCE, null);
    accessMock.mockRejectedValueOnce(new Error("ENOENT"));

    execFileAsyncMock
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(new Error("strip failed"));

    const mod = await loadModule();
    await expect(mod.ensureBinary()).resolves.toBeUndefined();

    expect(writeFileMock).toHaveBeenCalledWith(
      EXPECTED_HASH_PATH,
      await sha256Hex(FAKE_SOURCE),
      "utf-8",
    );
  });

  it("treats unreadable hash file as empty (forces recompile)", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    readFileMock.mockImplementation(async (path: string) => {
      if (path === EXPECTED_HASH_PATH) {
        throw new Error("ENOENT");
      }
      return FAKE_SOURCE;
    });

    const mod = await loadModule();
    await mod.ensureBinary();

    expect(unlinkMock).toHaveBeenCalledWith(EXPECTED_BINARY_PATH);
    expect(execFileAsyncMock).toHaveBeenCalledWith(
      "swiftc",
      expect.any(Array),
      expect.any(Object),
    );
  });

  it("trims whitespace when comparing stored hash", async () => {
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, `  ${expectedHash}\n`);
    accessMock.mockResolvedValueOnce(undefined);

    const mod = await loadModule();
    await mod.ensureBinary();

    expect(execFileAsyncMock).not.toHaveBeenCalled();
  });

  it("shares one compilation cycle across concurrent cold-start callers", async () => {
    // Given
    setReadFileForSourceAndHash(FAKE_SOURCE, null);
    accessMock.mockRejectedValue(new Error("ENOENT"));
    let releaseCompile = (): void => {};
    let signalCompileStarted = (): void => {};
    const compilationStarted = new Promise<void>((resolve) => {
      signalCompileStarted = () => resolve();
    });
    const heldCompilation = new Promise<void>((resolve) => {
      releaseCompile = () => resolve();
    });
    execFileAsyncMock
      .mockImplementationOnce(async () => {
        signalCompileStarted();
        await heldCompilation;
        return { stdout: "", stderr: "" };
      })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });
    const mod = await loadModule();

    // When
    const first = mod.ensureBinary();
    const second = mod.ensureBinary();
    const third = mod.ensureBinary();
    await compilationStarted;
    releaseCompile();
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      undefined,
      undefined,
      undefined,
    ]);

    // Then
    const swiftcCalls = execFileAsyncMock.mock.calls.filter((call) => call[0] === "swiftc");
    expect(swiftcCalls).toHaveLength(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("starts a new compilation cycle after a shared failure", async () => {
    // Given
    setReadFileForSourceAndHash(FAKE_SOURCE, null);
    accessMock.mockRejectedValue(new Error("ENOENT"));
    const sharedFailure = new Error("hash write failed");
    writeFileMock.mockRejectedValueOnce(sharedFailure);
    const mod = await loadModule();

    // When
    const first = mod.ensureBinary();
    const second = mod.ensureBinary();
    const failedCycleResults = await Promise.allSettled([first, second]);
    const failedCycleSwiftcCalls = execFileAsyncMock.mock.calls.filter(
      (call) => call[0] === "swiftc",
    );
    writeFileMock.mockResolvedValue(undefined);
    await expect(mod.ensureBinary()).resolves.toBeUndefined();

    // Then
    expect(failedCycleSwiftcCalls).toHaveLength(1);
    expect(failedCycleResults.every((result) => result.status === "rejected")).toBe(true);
    expect(second).toBe(first);
    const swiftcCalls = execFileAsyncMock.mock.calls.filter((call) => call[0] === "swiftc");
    expect(swiftcCalls).toHaveLength(2);
  });
});

describe("ensureBinary source-hash memoization", () => {
  it("reuses cached source hash across calls when mtime is unchanged (no repeated source read)", async () => {
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    accessMock.mockResolvedValue(undefined);
    statMock.mockResolvedValue({ mtimeMs: 12_345 });

    const mod = await loadModule();
    await mod.ensureBinary();
    await mod.ensureBinary();
    await mod.ensureBinary();

    const sourceReads = readFileMock.mock.calls.filter(
      (c) => c[0] !== EXPECTED_HASH_PATH,
    );
    expect(sourceReads.length).toBe(1);
    expect(execFileAsyncMock).not.toHaveBeenCalled();
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("invalidates the memoized source hash when mtime changes", async () => {
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    accessMock.mockResolvedValue(undefined);
    statMock
      .mockResolvedValueOnce({ mtimeMs: 1_000 })
      .mockResolvedValueOnce({ mtimeMs: 2_000 });

    const mod = await loadModule();
    await mod.ensureBinary();
    await mod.ensureBinary();

    const sourceReads = readFileMock.mock.calls.filter(
      (c) => c[0] !== EXPECTED_HASH_PATH,
    );
    expect(sourceReads.length).toBe(2);
  });

  it("surfaces the clear readSwiftSource error when the source file is missing", async () => {
    // Both stat and readFile fail with ENOENT for the source path; readFile
    // for the hash sidecar should never be reached.
    statMock.mockRejectedValue(
      Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" }),
    );
    readFileMock.mockImplementation(async (path: string) => {
      if (path === EXPECTED_HASH_PATH) {
        throw new Error("hash sidecar should not be read when source missing");
      }
      throw Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    });

    const mod = await loadModule();
    await expect(mod.ensureBinary()).rejects.toThrow(/Swift source not found at/);
  });
});

describe("runSwiftHelper", () => {
  it("returns trimmed stdout from the binary on the happy path", async () => {
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    accessMock.mockResolvedValue(undefined);

    runSwiftHelperProcessMock.mockResolvedValueOnce({
      stdout: "  line1\nline2  \n",
      stderr: "",
      exitCode: 0,
    });

    const mod = await loadModule();
    const out = await mod.runSwiftHelper();

    expect(out).toBe("line1\nline2");
    expect(runSwiftHelperProcessMock).toHaveBeenCalledWith(
      expect.objectContaining({ binaryPath: EXPECTED_BINARY_PATH, args: [] }),
    );
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("recompiles once on integrity spawn ENOENT after revalidation", async () => {
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    // ensureBinary cache hit; revalidate after spawn fail reports missing binary
    accessMock
      .mockResolvedValueOnce(undefined) // ensureBinary isBinaryExecutable
      .mockRejectedValueOnce(new Error("ENOENT")) // revalidateIntegrityFailure
      .mockResolvedValue(undefined);

    // Use duck-typed error so class identity survives vi.resetModules
    const spawnEnoent = Object.assign(new Error("spawn ENOENT"), {
      name: "SwiftHelperProcessError",
      failureKind: "spawn",
      spawnCode: "ENOENT",
      exitCode: undefined,
      signal: undefined,
      stdout: "",
      stderr: "",
    });

    runSwiftHelperProcessMock
      .mockRejectedValueOnce(spawnEnoent)
      .mockResolvedValueOnce({
        stdout: "fresh-output\n",
        stderr: "",
        exitCode: 0,
      });

    // After invalidate, ensureBinary recompiles via execFile (swiftc + strip)
    execFileAsyncMock
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    const mod = await loadModule();
    const out = await mod.runSwiftHelper();

    expect(out).toBe("fresh-output");
    expect(unlinkMock).toHaveBeenCalledWith(EXPECTED_BINARY_PATH);
    expect(unlinkMock).toHaveBeenCalledWith(EXPECTED_HASH_PATH);
    expect(runSwiftHelperProcessMock).toHaveBeenCalledTimes(2);
  });

  it("does not recompile on timeout", async () => {
    const { SwiftHelperProcessError } = await import(
      "../../src/main/swift/swift-helper-process.js"
    );
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    accessMock.mockResolvedValue(undefined);

    runSwiftHelperProcessMock.mockRejectedValueOnce(
      new SwiftHelperProcessError("timeout", "timed out"),
    );

    const mod = await loadModule();
    await expect(mod.runSwiftHelper()).rejects.toThrow(/timed out|Swift helper/);
    expect(unlinkMock).not.toHaveBeenCalled();
    expect(runSwiftHelperProcessMock).toHaveBeenCalledTimes(1);
  });

  it("does not recompile on stdout overflow", async () => {
    const { SwiftHelperProcessError } = await import(
      "../../src/main/swift/swift-helper-process.js"
    );
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    accessMock.mockResolvedValue(undefined);

    runSwiftHelperProcessMock.mockRejectedValueOnce(
      new SwiftHelperProcessError("stdout-overflow", "overflow"),
    );

    const mod = await loadModule();
    await expect(mod.runSwiftHelper()).rejects.toThrow(/overflow|Swift helper/);
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("does not recompile on semantic permission exit", async () => {
    const { SwiftHelperProcessError } = await import(
      "../../src/main/swift/swift-helper-process.js"
    );
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    accessMock.mockResolvedValue(undefined);

    runSwiftHelperProcessMock.mockRejectedValueOnce(
      new SwiftHelperProcessError("exit", "permission", {
        exitCode: 2,
        stderr: "denied",
      }),
    );

    const mod = await loadModule();
    await expect(mod.runSwiftHelper()).rejects.toMatchObject({
      name: "SwiftHelperError",
      kind: "permission-denied",
      exitCode: 2,
    });
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("throws when recompile after integrity spawn fails", async () => {
    const setTimeoutSpy = mockImmediateSetTimeout();
    try {
      const expectedHash = await sha256Hex(FAKE_SOURCE);
      setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
      accessMock
        .mockResolvedValueOnce(undefined) // initial ensureBinary
        .mockRejectedValueOnce(new Error("ENOENT")) // revalidateIntegrityFailure
        .mockRejectedValueOnce(new Error("ENOENT")); // ensureBinary during recompile

      runSwiftHelperProcessMock.mockRejectedValueOnce(
        Object.assign(new Error("spawn ENOENT"), {
          name: "SwiftHelperProcessError",
          failureKind: "spawn",
          spawnCode: "ENOENT",
          exitCode: undefined,
          signal: undefined,
          stdout: "",
          stderr: "",
        }),
      );

      for (let i = 0; i < 10; i++) {
        execFileAsyncMock.mockRejectedValueOnce(new Error(`swiftc fail ${i}`));
      }

      const mod = await loadModule();
      await expect(mod.runSwiftHelper()).rejects.toThrow(/swiftc fail/);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});

describe("path resolution", () => {
  it("uses SWIFT_SRC_DEV (project src/main path) in dev mode", async () => {
    setReadFileForSourceAndHash(FAKE_SOURCE, null);
    accessMock.mockRejectedValueOnce(new Error("ENOENT"));

    const mod = await loadModule();
    await mod.ensureBinary();

    const sourceReadCall = readFileMock.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        c[0].endsWith(join("src", "main", "googlemeet-events.swift")),
    );
    expect(sourceReadCall).toBeDefined();
    expect(sourceReadCall![0] as string).not.toContain(".asar");

    const swiftCall = execFileAsyncMock.mock.calls.find(
      (c) => c[0] === "swiftc",
    );
    expect(swiftCall).toBeDefined();
    const args = swiftCall![1] as string[];
    expect(args[0]).toBe(sourceReadCall![0]);
  });
});
