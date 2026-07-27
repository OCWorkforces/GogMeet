import { bench, describe, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/domain/entities/settings.js";

vi.mock("electron", () => ({
  ipcMain: {
    handle: (_channel: string, _handler: (...args: unknown[]) => unknown): void => {},
  },
}));

const { typedHandle } = await import("../../src/main/ipc-handlers/shared.js");

describe("ipc handler benchmark", () => {
  bench("typedHandle/settings:get registration", () => {
    typedHandle("settings:get", () => DEFAULT_SETTINGS);
  });
});
