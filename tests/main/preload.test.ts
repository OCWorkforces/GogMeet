import { beforeEach, describe, it, expect, vi } from "vitest";

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
  beforeEach(() => {
    vi.resetModules();
  });

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
    expect(typeof calendar.onResultUpdated).toBe("function");
  });

  it("window namespace has setHeight method", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    expect(typeof apiArg.window.setHeight).toBe("function");
  });

  it("app namespace has openExternal, joinMeeting, and getVersion methods", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];
    const app = apiArg.app;

    expect(typeof app.openExternal).toBe("function");
    expect(typeof app.joinMeeting).toBe("function");
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

  it("calendar.onResultUpdated returns unsubscribe function", async () => {
    await import("../../src/preload/index.js");

    const apiArg = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];

    const unsubscribe = apiArg.calendar.onResultUpdated(() => {});
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

    apiArg.calendar.getEvents(new AbortController().signal);
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

  it("invokes calendar and settings IPC channels by name", async () => {
    vi.resetModules();
    mockContextBridge.exposeInMainWorld.mockClear();
    mockIpcRenderer.invoke.mockClear();
    await import("../../src/preload/index.js");
    const { IPC_CHANNELS } = await import("../../src/shared/ipc-channels.js");
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];
    await api.calendar.getEvents(new AbortController().signal);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.CALENDAR_GET_EVENTS);
    await api.calendar.requestPermission();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION);
    await api.calendar.getPermissionStatus();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.CALENDAR_PERMISSION_STATUS);
    await api.calendar.disconnect();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.CALENDAR_DISCONNECT);
    await api.calendar.getUiState();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.CALENDAR_UI_STATE);
    await api.settings.get();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.SETTINGS_GET);
    await api.settings.set({ openBeforeMinutes: 2 });
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.SETTINGS_SET,
      { openBeforeMinutes: 2 },
    );
    await api.app.getVersion();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.APP_GET_VERSION);
  });

  it("joinMeeting rejects invalid id and invokes with branded id", async () => {
    vi.resetModules();
    mockContextBridge.exposeInMainWorld.mockClear();
    mockIpcRenderer.invoke.mockClear();
    await import("../../src/preload/index.js");
    const { IPC_CHANNELS } = await import("../../src/shared/ipc-channels.js");
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];
    const bad = await api.app.joinMeeting("");
    expect(bad.ok).toBe(false);
    expect(mockIpcRenderer.invoke).not.toHaveBeenCalled();
    await api.app.joinMeeting("evt-1");
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.APP_JOIN_MEETING, {
      id: "evt-1",
    });
  });

  it("setHeight clamps and sends WINDOW_SET_HEIGHT", async () => {
    vi.resetModules();
    mockContextBridge.exposeInMainWorld.mockClear();
    mockIpcRenderer.send.mockClear();
    await import("../../src/preload/index.js");
    const { IPC_CHANNELS } = await import("../../src/shared/ipc-channels.js");
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];
    api.window.setHeight(9999);
    expect(mockIpcRenderer.send).toHaveBeenCalledWith(
      IPC_CHANNELS.WINDOW_SET_HEIGHT,
      expect.objectContaining({ height: expect.any(Number) }),
    );
    const payload = mockIpcRenderer.send.mock.calls[0]?.[1] as { height: number };
    expect(payload.height).toBeLessThanOrEqual(9999);
  });

  it("push listeners register and unsubscribe", async () => {
    vi.resetModules();
    mockContextBridge.exposeInMainWorld.mockClear();
    mockIpcRenderer.on.mockClear();
    mockIpcRenderer.removeListener.mockClear();
    mockIpcRenderer.send.mockClear();
    await import("../../src/preload/index.js");
    const { IPC_CHANNELS } = await import("../../src/shared/ipc-channels.js");
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0]?.[1];
    const unsub1 = api.calendar.onResultUpdated(() => {});
    const unsub2 = api.settings.onChanged(() => {});
    const unsub3 = api.alert.onShowAlert(() => {});
    expect(mockIpcRenderer.on).toHaveBeenCalledWith(
      IPC_CHANNELS.CALENDAR_RESULT_UPDATED,
      expect.any(Function),
    );
    expect(mockIpcRenderer.on).toHaveBeenCalledWith(
      IPC_CHANNELS.SETTINGS_CHANGED,
      expect.any(Function),
    );
    expect(mockIpcRenderer.on).toHaveBeenCalledWith(
      IPC_CHANNELS.ALERT_SHOW,
      expect.any(Function),
    );
    unsub1();
    unsub2();
    unsub3();
    expect(mockIpcRenderer.removeListener).toHaveBeenCalledTimes(3);
    api.alert.notifyDismissed("evt-1");
    expect(mockIpcRenderer.send).toHaveBeenCalledWith(IPC_CHANNELS.ALERT_DISMISSED, {
      id: "evt-1",
    });
    expect(api.scheduler).toBeUndefined();
  });
});
