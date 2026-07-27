import { describe, it, expect, vi, beforeEach } from "vitest";

const { transports, scope, isReady, getPath } = vi.hoisted(() => ({
  transports: {
    file: { level: "" as string, resolvePathFn: undefined as undefined | (() => string) },
    console: { level: "" as string },
  },
  scope: vi.fn((name: string) => ({ name, info: vi.fn(), error: vi.fn() })),
  isReady: vi.fn(() => true),
  getPath: vi.fn(() => "/tmp/logs"),
}));

vi.mock("electron-log", () => ({
  default: {
    transports,
    scope,
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  app: {
    isReady,
    getPath,
  },
}));

describe("configureMainLogging", () => {
  beforeEach(() => {
    vi.resetModules();
    scope.mockClear();
    isReady.mockReturnValue(true);
    transports.file.level = "";
    transports.console.level = "";
    transports.file.resolvePathFn = undefined;
  });

  it("configures file/console levels and resolves log path when app ready", async () => {
    const mod = await import("../../src/main/utils/log.js");
    mod.configureMainLogging();
    expect(transports.file.level).toBe("info");
    expect(transports.console.level).toBe("info");
    expect(typeof transports.file.resolvePathFn).toBe("function");
    expect(transports.file.resolvePathFn?.()).toContain("main.log");
    // idempotent
    mod.configureMainLogging();
    expect(mod.mainLog).toBeDefined();
    expect(mod.schedulerLog).toBeDefined();
    expect(mod.calendarLog).toBeDefined();
  });

  it("ignores app path errors", async () => {
    isReady.mockImplementation(() => {
      throw new Error("no app");
    });
    const mod = await import("../../src/main/utils/log.js");
    expect(() => mod.configureMainLogging()).not.toThrow();
  });
});
