import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { execFileAsyncMock } = vi.hoisted(() => ({
  execFileAsyncMock: vi.fn(),
}));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const fn = Object.assign(vi.fn(), {
    [promisify.custom]: execFileAsyncMock,
  });
  return { execFile: fn };
});

const {
  accessMock,
  mkdirMock,
  readFileMock,
  writeFileMock,
  unlinkMock,
} = vi.hoisted(() => ({
  accessMock: vi.fn(),
  mkdirMock: vi.fn(),
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
  unlinkMock: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  access: accessMock,
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  unlink: unlinkMock,
}));

async function loadModule() {
  vi.resetModules();
  return await import("../../src/main/swift/binary-manager.js");
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

beforeEach(() => {
  execFileAsyncMock.mockReset();
  accessMock.mockReset();
  mkdirMock.mockReset();
  readFileMock.mockReset();
  writeFileMock.mockReset();
  unlinkMock.mockReset();

  mkdirMock.mockResolvedValue(undefined);
  writeFileMock.mockResolvedValue(undefined);
  unlinkMock.mockResolvedValue(undefined);
  execFileAsyncMock.mockResolvedValue({ stdout: "", stderr: "" });
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    setReadFileForSourceAndHash(FAKE_SOURCE, null);
    accessMock.mockRejectedValueOnce(new Error("ENOENT"));

    execFileAsyncMock
      .mockRejectedValueOnce(new Error("first swiftc failed"))
      .mockRejectedValueOnce(new Error("second swiftc failed"));

    const mod = await loadModule();
    await expect(mod.ensureBinary()).rejects.toThrow("second swiftc failed");
    expect(writeFileMock).not.toHaveBeenCalled();
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
});

describe("runSwiftHelper", () => {
  it("returns trimmed stdout from the binary on the happy path", async () => {
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    accessMock.mockResolvedValueOnce(undefined);

    execFileAsyncMock.mockResolvedValueOnce({
      stdout: "  line1\nline2  \n",
      stderr: "",
    });

    const mod = await loadModule();
    const out = await mod.runSwiftHelper();

    expect(out).toBe("line1\nline2");
    expect(execFileAsyncMock).toHaveBeenCalledWith(
      EXPECTED_BINARY_PATH,
      [],
      expect.objectContaining({ timeout: 15_000 }),
    );
  });

  it("recompiles and retries once when the binary fails on first invocation", async () => {
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    accessMock.mockResolvedValueOnce(undefined);
    accessMock.mockRejectedValueOnce(new Error("ENOENT"));

    execFileAsyncMock
      .mockRejectedValueOnce(new Error("binary crashed"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "fresh-output\n", stderr: "" });

    const mod = await loadModule();
    const out = await mod.runSwiftHelper();

    expect(out).toBe("fresh-output");
    expect(unlinkMock).toHaveBeenCalledWith(EXPECTED_BINARY_PATH);
    expect(unlinkMock).toHaveBeenCalledWith(EXPECTED_HASH_PATH);
    expect(execFileAsyncMock).toHaveBeenCalledTimes(4);
  });

  it("throws when the retry also fails", async () => {
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    accessMock.mockResolvedValueOnce(undefined);
    accessMock.mockRejectedValueOnce(new Error("ENOENT"));

    execFileAsyncMock
      .mockRejectedValueOnce(new Error("first binary failure"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(new Error("retry failure"));

    const mod = await loadModule();
    await expect(mod.runSwiftHelper()).rejects.toThrow("retry failure");
  });

  it("throws when the recompile itself fails during retry", async () => {
    const expectedHash = await sha256Hex(FAKE_SOURCE);
    setReadFileForSourceAndHash(FAKE_SOURCE, expectedHash);
    accessMock.mockResolvedValueOnce(undefined);
    accessMock.mockRejectedValueOnce(new Error("ENOENT"));

    execFileAsyncMock
      .mockRejectedValueOnce(new Error("first binary failure"))
      .mockRejectedValueOnce(new Error("swiftc fail 1"))
      .mockRejectedValueOnce(new Error("swiftc fail 2"));

    const mod = await loadModule();
    await expect(mod.runSwiftHelper()).rejects.toThrow("swiftc fail 2");
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
