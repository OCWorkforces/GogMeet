import { describe, it, expect } from "vitest";
import { IPC_CHANNELS } from "../../src/shared/ipc-channels.js";

describe("IPC_CHANNELS", () => {
  it("contains all required channel constants", () => {
    expect(IPC_CHANNELS.CALENDAR_GET_EVENTS).toBe("calendar:get-events");
    expect(IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION).toBe(
      "calendar:request-permission",
    );
    expect(IPC_CHANNELS.CALENDAR_PERMISSION_STATUS).toBe(
      "calendar:permission-status",
    );
    expect(IPC_CHANNELS.WINDOW_SET_HEIGHT).toBe("window:set-height");
    expect(IPC_CHANNELS.APP_OPEN_EXTERNAL).toBe("app:open-external");
    expect(IPC_CHANNELS.APP_GET_VERSION).toBe("app:get-version");
    expect(IPC_CHANNELS.SETTINGS_GET).toBe("settings:get");
    expect(IPC_CHANNELS.SETTINGS_SET).toBe("settings:set");
    expect(IPC_CHANNELS.SETTINGS_CHANGED).toBe("settings:changed");
    expect(IPC_CHANNELS.CALENDAR_EVENTS_UPDATED).toBe(
      "calendar:events-updated",
    );
    expect(IPC_CHANNELS.ALERT_SHOW).toBe("alert:show");
  });

  it("has 11 channels total", () => {
    expect(Object.keys(IPC_CHANNELS)).toHaveLength(11);
  });

  it("uses colon-separated naming convention", () => {
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(channel).toMatch(/^[a-z]+:[a-z-]+$/);
    }
  });
});
