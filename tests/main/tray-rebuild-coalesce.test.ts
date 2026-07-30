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
});
