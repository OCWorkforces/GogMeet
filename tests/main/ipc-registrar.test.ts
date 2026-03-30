import { describe, it, expect, vi } from "vitest";

// Use vi.hoisted for mock functions used in vi.mock factories
const {
  mockRegisterCalendarHandlers,
  mockRegisterSettingsHandlers,
  mockRegisterAppHandlers,
  mockRegisterWindowHandlers,
} = vi.hoisted(() => ({
  mockRegisterCalendarHandlers: vi.fn(),
  mockRegisterSettingsHandlers: vi.fn(),
  mockRegisterAppHandlers: vi.fn(),
  mockRegisterWindowHandlers: vi.fn(),
}));

vi.mock("../../src/main/ipc-handlers/calendar.js", () => ({
  registerCalendarHandlers: mockRegisterCalendarHandlers,
}));
vi.mock("../../src/main/ipc-handlers/settings.js", () => ({
  registerSettingsHandlers: mockRegisterSettingsHandlers,
}));
vi.mock("../../src/main/ipc-handlers/app.js", () => ({
  registerAppHandlers: mockRegisterAppHandlers,
}));
vi.mock("../../src/main/ipc-handlers/window.js", () => ({
  registerWindowHandlers: mockRegisterWindowHandlers,
}));

import { registerIpcHandlers } from "../../src/main/ipc.js";
import { validateSender } from "../../src/main/ipc-handlers/shared.js";

describe("registerIpcHandlers", () => {
  it("calls all handler registration functions", () => {
    const mockWin = {} as unknown as import("electron").BrowserWindow;
    registerIpcHandlers(mockWin);

    expect(mockRegisterCalendarHandlers).toHaveBeenCalledOnce();
    expect(mockRegisterSettingsHandlers).toHaveBeenCalledWith(mockWin);
    expect(mockRegisterAppHandlers).toHaveBeenCalledOnce();
    expect(mockRegisterWindowHandlers).toHaveBeenCalledWith(mockWin);
  });
});

describe("validateSender", () => {
  it("is imported from shared", () => {
    expect(typeof validateSender).toBe("function");
  });
});
