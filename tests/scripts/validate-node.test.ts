import { describe, expect, it, vi } from "vitest";

import {
  REQUIRED_MAJOR,
  parseMajor,
  validateNodeVersion,
  runValidation,
} from "../../scripts/validate-node.mjs";

function makeLogger() {
  return {
    log: vi.fn(),
    error: vi.fn(),
  };
}

describe("parseMajor", () => {
  it("parses bare semver", () => {
    expect(parseMajor("26.3.0")).toBe(26);
  });

  it("parses leading-v semver", () => {
    expect(parseMajor("v26.0.0")).toBe(26);
  });

  it("throws on malformed input", () => {
    expect(() => parseMajor("not-a-version")).toThrow(/Cannot parse/);
  });
});

describe("validateNodeVersion", () => {
  it("accepts versions at the required major", () => {
    const result = validateNodeVersion("26.0.0");
    expect(result.ok).toBe(true);
  });

  it("accepts versions above the required major", () => {
    const result = validateNodeVersion("27.1.0");
    expect(result.ok).toBe(true);
  });

  it("rejects versions below the required major with a clear error", () => {
    const result = validateNodeVersion("24.15.0");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Host Node\.js >= 26 required/);
      expect(result.error).toMatch(/found v24\.15\.0/);
      expect(result.error).toMatch(/\.nvmrc/);
    }
  });

  it("uses REQUIRED_MAJOR by default", () => {
    expect(REQUIRED_MAJOR).toBe(26);
  });
});

describe("runValidation", () => {
  it("returns 1 and logs the version error when host Node is too old", () => {
    const logger = makeLogger();
    const spawn = vi.fn();
    const code = runValidation({
      version: "20.10.0",
      env: {},
      spawn,
      generatorPath: "/dev/null/never",
      nodeExecPath: "/usr/bin/node",
      logger,
    });
    expect(code).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/ERROR: Host Node\.js >= 26 required/),
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("returns 0 and skips the generator when NODE_VALIDATE_SKIP_GENERATE=1", () => {
    const logger = makeLogger();
    const spawn = vi.fn();
    const code = runValidation({
      version: "26.3.0",
      env: { NODE_VALIDATE_SKIP_GENERATE: "1" },
      spawn,
      generatorPath: "/dev/null/never",
      nodeExecPath: "/usr/bin/node",
      logger,
    });
    expect(code).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringMatching(/Host Node\.js version: v26\.3\.0/),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringMatching(/OK: host Node\.js validation passed \(icon generation skipped\)\./),
    );
  });

  it("spawns the generator with the host Node binary and returns 0 on success", () => {
    const logger = makeLogger();
    const spawn = vi.fn().mockReturnValue({ status: 0 });
    const code = runValidation({
      version: "26.3.0",
      env: {},
      spawn,
      generatorPath: "/repo/scripts/generate-calendar-tray-icons.mjs",
      nodeExecPath: "/usr/local/bin/node",
      logger,
    });
    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      "/usr/local/bin/node",
      ["/repo/scripts/generate-calendar-tray-icons.mjs"],
      { stdio: "inherit" },
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringMatching(/OK: host Node\.js validation passed and icon generator completed\./),
    );
  });

  it("returns 1 when the generator exits non-zero", () => {
    const logger = makeLogger();
    const spawn = vi.fn().mockReturnValue({ status: 3 });
    const code = runValidation({
      version: "26.3.0",
      env: {},
      spawn,
      generatorPath: "/repo/scripts/generate-calendar-tray-icons.mjs",
      nodeExecPath: "/usr/local/bin/node",
      logger,
    });
    expect(code).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/icon generator exited with status 3/),
    );
  });

  it("returns 1 when spawn reports a launch error", () => {
    const logger = makeLogger();
    const spawn = vi.fn().mockReturnValue({ error: new Error("ENOENT: node") });
    const code = runValidation({
      version: "26.3.0",
      env: {},
      spawn,
      generatorPath: "/repo/scripts/generate-calendar-tray-icons.mjs",
      nodeExecPath: "/missing/node",
      logger,
    });
    expect(code).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/failed to launch icon generator: ENOENT: node/),
    );
  });

  it("returns 1 when the generator is killed by a signal", () => {
    const logger = makeLogger();
    const spawn = vi.fn().mockReturnValue({ status: null, signal: "SIGTERM" });
    const code = runValidation({
      version: "26.3.0",
      env: {},
      spawn,
      generatorPath: "/repo/scripts/generate-calendar-tray-icons.mjs",
      nodeExecPath: "/usr/local/bin/node",
      logger,
    });
    expect(code).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/terminated by signal SIGTERM/),
    );
  });
});
