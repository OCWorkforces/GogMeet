import { describe, it, expect, vi } from "vitest";

const { mockContextBridge, mockIpcRenderer } = vi.hoisted(() => ({
  mockContextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  mockIpcRenderer: {
    invoke: vi.fn().mockResolvedValue(null),
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
}));

describe("preload/index.ts", () => {
  it("exposes api via contextBridge", async () => {
    await import("../../src/preload/index.js");

    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      "api",
      expect.any(Object),
    );
  });

  it("api object has expected structure", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];
    expect(apiArg).toBeDefined();

    // Check top-level namespaces
    expect(apiArg).toHaveProperty("calendar");
    expect(apiArg).toHaveProperty("window");
    expect(apiArg).toHaveProperty("app");
    expect(apiArg).toHaveProperty("settings");
    expect(apiArg).toHaveProperty("alert");
  });

  it("calendar namespace has expected methods", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];
    const calendar = apiArg.calendar;

    expect(typeof calendar.getEvents).toBe("function");
    expect(typeof calendar.requestPermission).toBe("function");
    expect(typeof calendar.getPermissionStatus).toBe("function");
    expect(typeof calendar.onEventsUpdated).toBe("function");
  });

  it("window namespace has setHeight method", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    expect(typeof apiArg.window.setHeight).toBe("function");
  });

  it("app namespace has openExternal and getVersion methods", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];
    const app = apiArg.app;

    expect(typeof app.openExternal).toBe("function");
    expect(typeof app.getVersion).toBe("function");
  });

  it("settings namespace has get, set, onChanged methods", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];
    const settings = apiArg.settings;

    expect(typeof settings.get).toBe("function");
    expect(typeof settings.set).toBe("function");
    expect(typeof settings.onChanged).toBe("function");
  });

  it("alert namespace has onShowAlert and notifyDismissed methods", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    expect(typeof apiArg.alert.onShowAlert).toBe("function");
    expect(typeof apiArg.alert.notifyDismissed).toBe("function");
  });

  it("alert.notifyDismissed sends ipcRenderer.send with correct channel and id payload", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    apiArg.alert.notifyDismissed("event-123");
    expect(mockIpcRenderer.send).toHaveBeenCalledWith("alert:dismissed", {
      id: "event-123",
    });
  });

  it("calendar.onEventsUpdated returns unsubscribe function", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    const unsubscribe = apiArg.calendar.onEventsUpdated(() => {});
    expect(typeof unsubscribe).toBe("function");
  });

  it("settings.onChanged returns unsubscribe function", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    const unsubscribe = apiArg.settings.onChanged(() => {});
    expect(typeof unsubscribe).toBe("function");
  });

  it("getEvents calls ipcRenderer.invoke with correct channel", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    apiArg.calendar.getEvents();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith("calendar:get-events");
  });

  it("setHeight calls ipcRenderer.send with correct channel", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    apiArg.window.setHeight(350);
    expect(mockIpcRenderer.send).toHaveBeenCalledWith("window:set-height", {
      height: 350,
    });
  });

  it("openExternal calls ipcRenderer.invoke with correct channel", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    apiArg.app.openExternal("https://meet.google.com/abc");
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
      "app:open-external",
      { url: "https://meet.google.com/abc" },
    );
  });

  it("getVersion calls ipcRenderer.invoke with correct channel", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    apiArg.app.getVersion();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith("app:get-version");
  });

  it("settings.get calls ipcRenderer.invoke with correct channel", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    apiArg.settings.get();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith("settings:get");
  });

  it("settings.set calls ipcRenderer.invoke with correct channel", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    apiArg.settings.set({ openBeforeMinutes: 3 });
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith("settings:set", {
      openBeforeMinutes: 3,
    });
  });

  it("onShowAlert registers via ipcRenderer.on", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    apiArg.alert.onShowAlert(() => {});
    expect(mockIpcRenderer.on).toHaveBeenCalledWith(
      "alert:show",
      expect.any(Function),
    );
  });

  describe("openExternal allowlist parity", () => {
    const ALLOWED = [
      "https://meet.google.com/abc",
      "https://calendar.google.com/event?eid=x",
      "https://accounts.google.com/signin",
      "https://zoom.us/j/1234567890",
      "https://us02web.zoom.us/j/1234567890",
      "https://acme.zoom.us/my/room",
      "https://calendly.com/someone/30min",
    ];

    const REJECTED = [
      "https://zoom.us.evil.com/j/1",
      "https://evil-zoom.us/j/1",
      "https://calendly.com.evil.com/x",
      "https://app.calendly.com/x",
      "http://meet.google.com/abc",
      "https://evil.example/whatever",
    ];

    for (const url of ALLOWED) {
      it(`forwards allowed URL ${url} to IPC`, async () => {
        await import("../../src/preload/index.js");
        const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];
        mockIpcRenderer.invoke.mockClear();

        await apiArg.app.openExternal(url);

        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
          "app:open-external",
          { url },
        );
      });
    }

    for (const url of REJECTED) {
      it(`drops rejected URL ${url} without IPC`, async () => {
        await import("../../src/preload/index.js");
        const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];
        mockIpcRenderer.invoke.mockClear();

        await apiArg.app.openExternal(url);

        expect(mockIpcRenderer.invoke).not.toHaveBeenCalled();
      });
    }
  });
});
