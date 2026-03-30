import { describe, it, expect } from "vitest";
import { validateSender } from "../../src/main/ipc-handlers/shared.js";
import { isAllowedMeetUrl } from "../../src/main/utils/url-validation.js";
import type { IpcMainInvokeEvent } from "electron";

describe("validateSender", () => {
  it("accepts file:// origin (packaged app)", () => {
    const event = {
      senderFrame: { url: "file:///path/to/app/index.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("accepts http://localhost:5173 origin (dev server)", () => {
    const event = {
      senderFrame: { url: "http://localhost:5173/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("accepts http://127.0.0.1:5173 origin (dev server)", () => {
    const event = {
      senderFrame: { url: "http://127.0.0.1:5173/index.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("rejects malicious origin", () => {
    const event = {
      senderFrame: { url: "https://evil.com/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects empty sender URL", () => {
    const event = {
      senderFrame: { url: "" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects undefined sender frame", () => {
    const event = {
      senderFrame: undefined,
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects non-allowlisted port", () => {
    const event = {
      senderFrame: { url: "http://localhost:3000/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects similar but different domain", () => {
    const event = {
      senderFrame: { url: "http://localhost.com:5173/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });
});

describe("isAllowedMeetUrl", () => {
  it("accepts https://meet.google.com/ URLs", () => {
    expect(isAllowedMeetUrl("https://meet.google.com/abc-def-ghi")).toBe(true);
    expect(isAllowedMeetUrl("https://meet.google.com/new")).toBe(true);
  });

  it("accepts https://calendar.google.com/ URLs", () => {
    expect(isAllowedMeetUrl("https://calendar.google.com/event/123")).toBe(
      true,
    );
    expect(isAllowedMeetUrl("https://calendar.google.com/r")).toBe(true);
  });

  it("accepts https://accounts.google.com/ URLs", () => {
    expect(isAllowedMeetUrl("https://accounts.google.com/signin")).toBe(true);
    expect(isAllowedMeetUrl("https://accounts.google.com/")).toBe(true);
  });

  it("rejects non-allowlisted URLs", () => {
    expect(isAllowedMeetUrl("https://evil.com/")).toBe(false);
    expect(isAllowedMeetUrl("https://google.com/")).toBe(false);
    expect(isAllowedMeetUrl("http://meet.google.com/abc")).toBe(false); // http not https
  });

  it("rejects partial match attacks", () => {
    expect(isAllowedMeetUrl("https://meet.google.com.evil.com/")).toBe(false);
    expect(isAllowedMeetUrl("https://evil.meet.google.com/")).toBe(false);
    expect(isAllowedMeetUrl("https://meetgoogle.com/")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAllowedMeetUrl("")).toBe(false);
  });

  it("rejects URLs without proper prefix", () => {
    expect(isAllowedMeetUrl("meet.google.com/abc")).toBe(false);
    expect(isAllowedMeetUrl("ftp://meet.google.com/")).toBe(false);
  });
});
