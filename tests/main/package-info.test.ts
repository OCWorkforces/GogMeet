import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to avoid hoisting issues with vi.mock factory
const { mockGetAppPath } = vi.hoisted(() => ({
  mockGetAppPath: vi.fn().mockReturnValue("/app"),
}));

vi.mock("electron", () => ({
  app: {
    getAppPath: mockGetAppPath,
    getVersion: vi.fn().mockReturnValue("1.0.0"),
    quit: vi.fn(),
    dock: { hide: vi.fn(), show: vi.fn() },
    isPackaged: false,
    setAboutPanelOptions: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    showAboutPanel: vi.fn(),
    getPath: vi.fn().mockReturnValue("/tmp/test-user-data"),
  },
}));

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));

import {
  getPackageInfo,
  clearPackageInfoCache,
  isPackageInfoLoaded,
} from "../../src/main/utils/packageInfo.js";
import { readFileSync } from "fs";

const mockReadFileSync = vi.mocked(readFileSync);

describe("getPackageInfo", () => {
  beforeEach(() => {
    clearPackageInfoCache();
    vi.clearAllMocks();
    mockGetAppPath.mockReturnValue("/app");
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        name: "gogmeet",
        productName: "GogMeet",
        version: "1.6.1",
        description: "Test description",
        repository: "https://github.com/test/repo",
        homepage: "https://github.com/test/repo",
        author: "Test Author",
      }),
    );
  });

  it("reads package.json from app path", () => {
    getPackageInfo();
    expect(mockReadFileSync).toHaveBeenCalledWith("/app/package.json", "utf-8");
  });

  it("returns parsed package.json data", () => {
    const info = getPackageInfo();
    expect(info.name).toBe("gogmeet");
    expect(info.productName).toBe("GogMeet");
    expect(info.version).toBe("1.6.1");
    expect(info.description).toBe("Test description");
    expect(info.repository).toBe("https://github.com/test/repo");
    expect(info.homepage).toBe("https://github.com/test/repo");
    expect(info.author).toBe("Test Author");
  });

  it("caches result on subsequent calls", () => {
    getPackageInfo();
    getPackageInfo();
    expect(mockReadFileSync).toHaveBeenCalledOnce();
  });

  it("returns frozen object", () => {
    const info = getPackageInfo();
    expect(Object.isFrozen(info)).toBe(true);
  });

  it("returns fallback when readFileSync throws", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const info = getPackageInfo();
    expect(info.name).toBe("gogmeet");
    expect(info.productName).toBe("GogMeet");
    expect(info.version).toBe("1.0.0");
  });
});

describe("clearPackageInfoCache", () => {
  it("clears cached data", () => {
    getPackageInfo();
    expect(isPackageInfoLoaded()).toBe(true);
    clearPackageInfoCache();
    expect(isPackageInfoLoaded()).toBe(false);
  });
});

describe("isPackageInfoLoaded", () => {
  it("returns false before loading", () => {
    expect(isPackageInfoLoaded()).toBe(false);
  });

  it("returns true after loading", () => {
    getPackageInfo();
    expect(isPackageInfoLoaded()).toBe(true);
  });
});
