import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  isCalendarAutomationEligible,
  isCalendarOk,
  calendarLiveOk,
  calendarOfflineOk,
} from "../../src/domain/entities/calendar-result.js";
import { SECURE_WEB_PREFERENCES } from "../../src/main/utils/browser-window.js";
import { IPC_CHANNELS } from "../../src/shared/ipc-channels.js";
import {
  SWIFT_HELPER_STDOUT_LIMIT_BYTES,
  SWIFT_HELPER_STDERR_LIMIT_BYTES,
  SWIFT_HELPER_TIMEOUT_MS,
} from "../../src/main/swift/swift-helper-process.js";
import {
  WATCH_SIDECAR_STDOUT_LIMIT_BYTES,
  WATCH_SIDECAR_STDERR_LIMIT_BYTES,
} from "../../src/main/swift/calendar-watch-sidecar.js";
import {
  GOOGLE_HTTP_BODY_LIMIT_BYTES,
  GOOGLE_HTTP_REQUEST_TIMEOUT_MS,
  GOOGLE_POLL_BUDGET_MS,
} from "../../src/main/calendar/google-http.js";
import {
  isPerfTraceEnabled,
  _resetPerfTraceForTests,
  MAX_PERF_TRACE_ROWS,
  MAX_PERF_TRACE_SERIALIZED_BYTES,
} from "../../src/main/utils/performance-trace.js";
import { PERF_TRACE_FILENAME } from "../../src/main/utils/performance-trace-file.js";
import {
  PERF_PROBE_USER_DATA_PREFIX,
  PERF_PROBE_MODES,
} from "../../src/main/app/performance-probe-contract.js";

vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => "/tmp", getAppPath: () => "/tmp" },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
  BrowserWindow: vi.fn(),
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString("utf-8"),
  },
}));

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, acc);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

describe("guardrails: Electron window security (O3)", () => {
  it("SECURE_WEB_PREFERENCES freezes the security trio", () => {
    expect(SECURE_WEB_PREFERENCES).toEqual({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
  });

  it("every BrowserWindow construction spreads SECURE_WEB_PREFERENCES", () => {
    const roots = [
      join(process.cwd(), "src/main/index.ts"),
      join(process.cwd(), "src/main/windows"),
    ];
    const files: string[] = [];
    for (const r of roots) {
      const st = statSync(r);
      if (st.isDirectory()) walkTs(r, files);
      else files.push(r);
    }
    const windowFiles = files.filter((f) => {
      const text = readFileSync(f, "utf8");
      return /new\s+BrowserWindow\s*\(/.test(text);
    });
    expect(windowFiles.length).toBeGreaterThan(0);
    for (const f of windowFiles) {
      const text = readFileSync(f, "utf8");
      expect(text, f).toMatch(/SECURE_WEB_PREFERENCES/);
      expect(text, f).not.toMatch(/nodeIntegration\s*:\s*true/);
      expect(text, f).not.toMatch(/contextIsolation\s*:\s*false/);
      expect(text, f).not.toMatch(/sandbox\s*:\s*false/);
    }
  });
});

describe("guardrails: degraded automation (G4)", () => {
  const now = Date.now();

  it("only live complete is automation-eligible", () => {
    expect(isCalendarAutomationEligible(calendarLiveOk([], "complete", now))).toBe(true);
    expect(isCalendarAutomationEligible(calendarLiveOk([], "partial", now))).toBe(false);
    expect(isCalendarAutomationEligible(calendarOfflineOk([], now - 1000, now))).toBe(false);
    expect(
      isCalendarAutomationEligible({ kind: "err", error: "x", code: "unknown" }),
    ).toBe(false);
  });

  it("offline and partial remain isCalendarOk for explicit join visibility", () => {
    expect(isCalendarOk(calendarLiveOk([], "partial", now))).toBe(true);
    expect(isCalendarOk(calendarOfflineOk([], now - 1000, now))).toBe(true);
  });
});

describe("guardrails: IPC cutover (G6)", () => {
  it("exposes result-updated push and not deleted force-poll / events-updated", () => {
    expect(IPC_CHANNELS.CALENDAR_RESULT_UPDATED).toBe("calendar:result-updated");
    expect("SCHEDULER_FORCE_POLL" in IPC_CHANNELS).toBe(false);
    expect("CALENDAR_EVENTS_UPDATED" in IPC_CHANNELS).toBe(false);
    expect(Object.values(IPC_CHANNELS)).not.toContain("scheduler:force-poll");
    expect(Object.values(IPC_CHANNELS)).not.toContain("calendar:events-updated");
  });
});

describe("guardrails: resource bounds (G2 / A4 / G11)", () => {
  it("exports Swift and Google safety ceilings", () => {
    expect(SWIFT_HELPER_STDOUT_LIMIT_BYTES).toBe(8 * 1024 * 1024);
    expect(SWIFT_HELPER_STDERR_LIMIT_BYTES).toBe(256 * 1024);
    expect(SWIFT_HELPER_TIMEOUT_MS).toBe(15_000);
    expect(GOOGLE_HTTP_REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(GOOGLE_HTTP_BODY_LIMIT_BYTES).toBe(8 * 1024 * 1024);
    expect(GOOGLE_POLL_BUDGET_MS).toBe(60_000);
  });

  it("watch-sidecar ceilings stay byte-identical to one-shot helper", () => {
    expect(WATCH_SIDECAR_STDOUT_LIMIT_BYTES).toBe(SWIFT_HELPER_STDOUT_LIMIT_BYTES);
    expect(WATCH_SIDECAR_STDERR_LIMIT_BYTES).toBe(SWIFT_HELPER_STDERR_LIMIT_BYTES);
    expect(WATCH_SIDECAR_STDOUT_LIMIT_BYTES).toBe(8 * 1024 * 1024);
    expect(WATCH_SIDECAR_STDERR_LIMIT_BYTES).toBe(256 * 1024);
  });
});

describe("guardrails: perf trace opt-in (G8 / G9)", () => {
  const prev = process.env["GOGMEET_PERF_TRACE"];

  beforeEach(() => {
    delete process.env["GOGMEET_PERF_TRACE"];
    _resetPerfTraceForTests();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env["GOGMEET_PERF_TRACE"];
    else process.env["GOGMEET_PERF_TRACE"] = prev;
    _resetPerfTraceForTests();
  });

  it("is disabled by default", () => {
    expect(isPerfTraceEnabled()).toBe(false);
  });

  it("freezes row/byte caps and fixed JSONL filename", () => {
    expect(MAX_PERF_TRACE_ROWS).toBe(1024);
    expect(MAX_PERF_TRACE_SERIALIZED_BYTES).toBe(1 * 1024 * 1024);
    expect(PERF_TRACE_FILENAME).toBe("gogmeet-perf-trace-v1.jsonl");
  });
});

describe("guardrails: packaged probe privacy (G12)", () => {
  it("freezes finite modes and userData prefix", () => {
    expect([...PERF_PROBE_MODES]).toEqual(["startup", "tray", "alert", "safe-storage"]);
    expect(PERF_PROBE_USER_DATA_PREFIX).toBe("gogmeet-perf-probe-");
  });
});

describe("guardrails: Google page cap freeze", () => {
  it("freezes MAX_PAGES at 50 in google-calendar source", () => {
    const src = readFileSync(
      join(process.cwd(), "src/main/calendar/providers/google-calendar.ts"),
      "utf8",
    );
    expect(src).toMatch(/const MAX_PAGES\s*=\s*50\b/);
  });
});
