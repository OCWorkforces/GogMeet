import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parsePerfProbeMode,
  validateProbeUserDataDir,
  preflightPerformanceProbe,
  PERF_PROBE_USER_DATA_PREFIX,
  isPerfProbeEnvPresent,
} from "../../src/main/app/performance-probe-contract.js";
import { createPerformanceProbeCalendarProvider } from "../../src/main/calendar/providers/performance-probe-calendar.js";
import { isCalendarAutomationEligible } from "../../src/domain/entities/calendar-result.js";

describe("performance-probe-contract", () => {
  const prevProbe = process.env["GOGMEET_PERF_PROBE"];
  let dir: string;

  beforeEach(() => {
    delete process.env["GOGMEET_PERF_PROBE"];
    dir = mkdtempSync(join(tmpdir(), PERF_PROBE_USER_DATA_PREFIX));
  });

  afterEach(() => {
    if (prevProbe === undefined) delete process.env["GOGMEET_PERF_PROBE"];
    else process.env["GOGMEET_PERF_PROBE"] = prevProbe;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("parses finite modes only", () => {
    expect(parsePerfProbeMode(undefined)).toBeNull();
    expect(parsePerfProbeMode("")).toBeNull();
    expect(parsePerfProbeMode("startup")).toBe("startup");
    expect(parsePerfProbeMode("tray")).toBe("tray");
    expect(parsePerfProbeMode("alert")).toBe("alert");
    expect(parsePerfProbeMode("safe-storage")).toBe("safe-storage");
    expect(parsePerfProbeMode("evil")).toBeNull();
  });

  it("validates userData prefix and tmpdir containment", () => {
    expect(validateProbeUserDataDir(dir).ok).toBe(true);
    expect(validateProbeUserDataDir("").ok).toBe(false);
    const bad = mkdtempSync(join(tmpdir(), "not-gogmeet-"));
    try {
      expect(validateProbeUserDataDir(bad).ok).toBe(false);
    } finally {
      rmSync(bad, { recursive: true, force: true });
    }
    const filePath = join(dir, "file");
    writeFileSync(filePath, "x");
    expect(validateProbeUserDataDir(filePath).ok).toBe(false);
  });

  it("preflight requires packaged + trace + valid userData", () => {
    expect(
      preflightPerformanceProbe({
        envMode: "startup",
        isPackaged: false,
        perfTraceEnabled: true,
        userDataPath: dir,
      }).ok,
    ).toBe(false);

    expect(
      preflightPerformanceProbe({
        envMode: "startup",
        isPackaged: true,
        perfTraceEnabled: false,
        userDataPath: dir,
      }).ok,
    ).toBe(false);

    expect(
      preflightPerformanceProbe({
        envMode: "nope",
        isPackaged: true,
        perfTraceEnabled: true,
        userDataPath: dir,
      }).ok,
    ).toBe(false);

    const ok = preflightPerformanceProbe({
      envMode: "startup",
      isPackaged: true,
      perfTraceEnabled: true,
      userDataPath: dir,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.mode).toBe("startup");
  });

  it("isPerfProbeEnvPresent is false when unset", () => {
    expect(isPerfProbeEnvPresent()).toBe(false);
    process.env["GOGMEET_PERF_PROBE"] = "startup";
    expect(isPerfProbeEnvPresent()).toBe(true);
  });
});

describe("performance-probe-calendar", () => {
  it("returns live complete empty events with granted permission and no watch", async () => {
    const provider = createPerformanceProbeCalendarProvider();
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.source).toBe("live");
      expect(result.completeness).toBe("complete");
      expect(result.events).toEqual([]);
      expect(isCalendarAutomationEligible(result)).toBe(true);
    }
    expect(await provider.getPermissionStatus()).toBe("granted");
    expect(provider.startWatch).toBeUndefined();
    expect(provider.stopWatch).toBeUndefined();
  });
});

describe("probe path rejection helpers", () => {
  it("rejects symlink-style basename outside prefix when using plain path", () => {
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    try {
      // Path that does not use the required prefix
      const nested = join(outside, "nested");
      mkdirSync(nested);
      const v = validateProbeUserDataDir(nested);
      expect(v.ok).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
