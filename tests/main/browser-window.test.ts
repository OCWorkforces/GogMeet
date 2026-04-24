import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";

// Local mock for electron — extends the global setup with `session`,
// and lets us flip `app.isPackaged` per-test.
const { mockOnHeadersReceived, mockLoadURL, mockLoadFile, appState } = vi.hoisted(() => ({
  mockOnHeadersReceived: vi.fn(),
  mockLoadURL: vi.fn().mockResolvedValue(undefined),
  mockLoadFile: vi.fn().mockResolvedValue(undefined),
  appState: { isPackaged: false },
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged;
    },
  },
  BrowserWindow: vi.fn(),
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: mockOnHeadersReceived,
      },
    },
  },
}));

import type { BrowserWindow } from "electron";
import {
  SECURE_WEB_PREFERENCES,
  getPreloadPath,
  loadWindowContent,
  setupCspHeaders,
} from "../../src/main/utils/browser-window.js";

function makeWindow(): BrowserWindow {
  const win = {
    loadURL: mockLoadURL,
    loadFile: mockLoadFile,
  };
  return win as unknown as BrowserWindow;
}

describe("SECURE_WEB_PREFERENCES", () => {
  it("enforces the three required security flags", () => {
    expect(SECURE_WEB_PREFERENCES).toEqual({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
  });

  it("is frozen-shaped (as const) — its keys are exactly the security trio", () => {
    expect(Object.keys(SECURE_WEB_PREFERENCES).sort()).toEqual([
      "contextIsolation",
      "nodeIntegration",
      "sandbox",
    ]);
  });
});

describe("getPreloadPath", () => {
  it("returns an absolute path ending in preload/index.cjs", () => {
    const p = getPreloadPath();
    expect(path.isAbsolute(p)).toBe(true);
    expect(p.endsWith(path.join("preload", "index.cjs"))).toBe(true);
  });

  it("resolves relative to ../preload from the utils/ directory (no extra dot-segments)", () => {
    const p = getPreloadPath();
    // Path is normalised — there should be no unresolved ".." or "." segments left.
    expect(p.split(path.sep)).not.toContain("..");
    expect(p.split(path.sep)).not.toContain(".");
  });
});

describe("loadWindowContent", () => {
  beforeEach(() => {
    mockLoadURL.mockClear();
    mockLoadFile.mockClear();
    appState.isPackaged = false;
    delete process.env["VITE_DEV_SERVER_URL"];
  });

  it("uses loadURL with the dev server URL when not packaged", async () => {
    const win = makeWindow();
    loadWindowContent(win, "index");
    // load() runs synchronously; allow any resolved-promise microtasks to settle.
    await Promise.resolve();
    expect(mockLoadURL).toHaveBeenCalledWith("http://localhost:5173/index.html");
    expect(mockLoadFile).not.toHaveBeenCalled();
  });

  it("respects VITE_DEV_SERVER_URL when set", async () => {
    process.env["VITE_DEV_SERVER_URL"] = "http://127.0.0.1:6000";
    const win = makeWindow();
    loadWindowContent(win, "settings");
    await Promise.resolve();
    expect(mockLoadURL).toHaveBeenCalledWith("http://127.0.0.1:6000/settings.html");
  });

  it("uses loadFile with the bundled HTML in production", async () => {
    appState.isPackaged = true;
    const win = makeWindow();
    loadWindowContent(win, "alert");
    await Promise.resolve();
    expect(mockLoadFile).toHaveBeenCalledTimes(1);
    const arg = mockLoadFile.mock.calls[0]?.[0] as string;
    expect(path.isAbsolute(arg)).toBe(true);
    expect(arg.endsWith(path.join("renderer", "alert.html"))).toBe(true);
    expect(mockLoadURL).not.toHaveBeenCalled();
  });

  it("swallows load errors and logs them via console.error", async () => {
    const error = new Error("boom");
    mockLoadURL.mockRejectedValueOnce(error);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const win = makeWindow();
      // Must not throw synchronously.
      expect(() => loadWindowContent(win, "index")).not.toThrow();
      // Allow the rejected promise + .catch handler to run.
      await Promise.resolve();
      await Promise.resolve();
      expect(errSpy).toHaveBeenCalledWith(
        "[browser-window] Failed to load content:",
        error,
      );
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe("setupCspHeaders", () => {
  beforeEach(() => {
    mockOnHeadersReceived.mockReset();
    appState.isPackaged = false;
  });

  it("registers an onHeadersReceived handler exactly once", () => {
    setupCspHeaders();
    expect(mockOnHeadersReceived).toHaveBeenCalledTimes(1);
    expect(typeof mockOnHeadersReceived.mock.calls[0]?.[0]).toBe("function");
  });

  it("emits a CSP including ws://localhost:* in dev for HMR", () => {
    setupCspHeaders();
    const handler = mockOnHeadersReceived.mock.calls[0]?.[0] as (
      details: { responseHeaders?: Record<string, string[]> },
      cb: (resp: { responseHeaders: Record<string, string[]> }) => void,
    ) => void;
    const cb = vi.fn();
    handler({ responseHeaders: { "X-Existing": ["1"] } }, cb);
    const csp = cb.mock.calls[0]?.[0]?.responseHeaders["Content-Security-Policy"]?.[0];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("connect-src 'self' ws://localhost:*");
    // Existing headers must be preserved.
    expect(cb.mock.calls[0]?.[0]?.responseHeaders["X-Existing"]).toEqual(["1"]);
  });

  it("omits the dev connect-src directive in production", () => {
    appState.isPackaged = true;
    setupCspHeaders();
    const handler = mockOnHeadersReceived.mock.calls[0]?.[0] as (
      details: { responseHeaders?: Record<string, string[]> },
      cb: (resp: { responseHeaders: Record<string, string[]> }) => void,
    ) => void;
    const cb = vi.fn();
    handler({ responseHeaders: {} }, cb);
    const csp = cb.mock.calls[0]?.[0]?.responseHeaders["Content-Security-Policy"]?.[0];
    expect(csp).not.toContain("ws://localhost");
    expect(csp).not.toContain("connect-src");
    expect(csp).toContain("default-src 'self'");
  });
});
