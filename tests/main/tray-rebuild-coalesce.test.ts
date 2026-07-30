import { describe, it, expect, vi } from "vitest";
import { createMockEvent } from "../helpers/test-utils.js";
import type { CalendarUiState } from "../../src/domain/entities/calendar-ui-state.js";

// tray.ts imports about-window (reads SVG at module load) — mock before import.
vi.mock("electron", () => ({
  Tray: vi.fn(),
  Menu: { buildFromTemplate: vi.fn().mockReturnValue({}) },
  app: { once: vi.fn(), quit: vi.fn() },
  nativeImage: {
    createFromPath: vi.fn().mockReturnValue({
      toPNG: () => Buffer.alloc(0),
      isEmpty: () => false,
    }),
    createEmpty: vi.fn().mockReturnValue({ addRepresentation: vi.fn(), isEmpty: () => true }),
  },
  nativeTheme: { shouldUseDarkColors: false, on: vi.fn(), removeListener: vi.fn() },
  BrowserWindow: vi.fn(),
}));
vi.mock("../../src/main/windows/about-window.js", () => ({ showAbout: vi.fn() }));
vi.mock("../../src/main/windows/settings-window.js", () => ({ createSettingsWindow: vi.fn() }));
vi.mock("../../src/main/facades/calendar-status.js", () => ({
  getLastCalendarStatus: () => ({ kind: "ok" as const }),
}));

const { trayMenuSignature } = await import("../../src/main/tray.js");

const baseUi: CalendarUiState = {
  permission: "granted",
  phase: "ready",
  lastError: null,
  accountEmail: "a@b.com",
  events: [],
  offline: false,
  oauthConfigured: true,
  cacheAgeMs: null,
};

describe("trayMenuSignature", () => {
  it("is stable for identical inputs and changes when events change", () => {
    const e1 = createMockEvent({ title: "A" });
    const a = trayMenuSignature(baseUi, [e1], true, "ok", null);
    const b = trayMenuSignature(baseUi, [e1], true, "ok", null);
    expect(a).toBe(b);
    const e2 = createMockEvent({ title: "B" });
    const c = trayMenuSignature(baseUi, [e2], true, "ok", null);
    expect(c).not.toBe(a);
  });

  it("changes when status or offline flag changes", () => {
    const events = [createMockEvent()];
    const a = trayMenuSignature(baseUi, events, true, "ok", null);
    const offline = trayMenuSignature({ ...baseUi, offline: true }, events, true, "ok", null);
    expect(offline).not.toBe(a);
    const err = trayMenuSignature(baseUi, events, true, "err", "permission-denied");
    expect(err).not.toBe(a);
  });

  it("changes when account, permission, phase, or showTomorrow change", () => {
    const events = [createMockEvent()];
    const base = trayMenuSignature(baseUi, events, true, "ok", null);
    expect(trayMenuSignature({ ...baseUi, accountEmail: "x@y.z" }, events, true, "ok", null)).not.toBe(
      base,
    );
    expect(trayMenuSignature({ ...baseUi, permission: "denied" }, events, true, "ok", null)).not.toBe(
      base,
    );
    expect(trayMenuSignature({ ...baseUi, phase: "error" }, events, true, "ok", null)).not.toBe(base);
    expect(trayMenuSignature(baseUi, events, false, "ok", null)).not.toBe(base);
    expect(trayMenuSignature({ ...baseUi, oauthConfigured: false }, events, true, "ok", null)).not.toBe(
      base,
    );
    expect(trayMenuSignature({ ...baseUi, lastError: "x" }, events, true, "ok", null)).not.toBe(base);
  });

  it("changes when wall clock passes meeting end (content unchanged)", () => {
    const now = Date.UTC(2026, 6, 30, 14, 0, 0);
    const end = now + 90 * 60_000;
    const event = createMockEvent({
      startDate: new Date(now - 60 * 60_000).toISOString(),
      endDate: new Date(end).toISOString(),
    });
    const during = trayMenuSignature(baseUi, [event], true, "ok", null, now + 30 * 60_000);
    const after = trayMenuSignature(baseUi, [event], true, "ok", null, end + 1000);
    expect(after).not.toBe(during);
  });
});

describe("tray tooltip helpers", () => {
  it("truncates and formats countdown labels", async () => {
    const {
      truncateTrayTooltip,
      formatTrayCountdownLabel,
      buildWindowsTrayTooltip,
      TRAY_TOOLTIP_MAX_CHARS,
    } = await import("../../src/main/tray.js");
    expect(truncateTrayTooltip("short")).toBe("short");
    expect(truncateTrayTooltip("x".repeat(100), 5)).toBe("xxxx\u2026");
    expect(truncateTrayTooltip("ab", 1)).toBe("\u2026");
    expect(formatTrayCountdownLabel("Hello World Meeting", 1, false)).toContain("in 1 min");
    expect(formatTrayCountdownLabel("Hello World Meeting", 5, true)).toMatch(/Hello|min/);
    expect(buildWindowsTrayTooltip(null, undefined, undefined, true)).toContain("Offline");
    expect(buildWindowsTrayTooltip("Meet", 3).length).toBeLessThanOrEqual(TRAY_TOOLTIP_MAX_CHARS);
  });
});
