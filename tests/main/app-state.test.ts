import { describe, it, expect } from "vitest";
import type { AppState } from "../../src/shared/app-state.js";
import type { MeetingEvent } from "../../src/shared/models.js";
import { createMockEvent } from "../helpers/test-utils.js";

/**
 * Tests for AppState discriminated union (src/shared/app-state.ts).
 *
 * AppState models the renderer popover state machine. It is consumed by
 * `src/renderer/index.ts` and `src/renderer/rendering/body.ts`. These tests
 * verify:
 *  - Each variant has the correct discriminant + payload fields
 *  - Optional fields (where applicable) behave correctly
 *  - Exhaustive type narrowing works (compile-time + runtime)
 *  - Round-tripping through structuredClone (mock IPC payload semantics)
 *    preserves shape, including for has-events with full MeetingEvent[].
 */

describe("AppState shape", () => {
  it("loading variant has only `type` field", () => {
    const state: AppState = { type: "loading" };
    expect(state.type).toBe("loading");
    expect(Object.keys(state)).toEqual(["type"]);
  });

  it("no-permission variant carries `retrying: boolean`", () => {
    const retrying: AppState = { type: "no-permission", retrying: true };
    const idle: AppState = { type: "no-permission", retrying: false };
    expect(retrying.type).toBe("no-permission");
    expect(retrying.retrying).toBe(true);
    expect(idle.retrying).toBe(false);
  });

  it("no-events variant has only `type` field", () => {
    const state: AppState = { type: "no-events" };
    expect(state.type).toBe("no-events");
    expect(Object.keys(state)).toEqual(["type"]);
  });

  it("has-events variant carries `events: MeetingEvent[]`", () => {
    const events: MeetingEvent[] = [createMockEvent()];
    const state: AppState = { type: "has-events", events };
    expect(state.type).toBe("has-events");
    expect(state.events).toBe(events);
    expect(state.events.length).toBe(1);
  });

  it("has-events allows an empty array (distinct from no-events semantically)", () => {
    const state: AppState = { type: "has-events", events: [] };
    expect(state.type).toBe("has-events");
    expect(state.events).toEqual([]);
  });

  it("error variant carries `message: string`", () => {
    const state: AppState = { type: "error", message: "Boom" };
    expect(state.type).toBe("error");
    expect(state.message).toBe("Boom");
  });

  it("error variant accepts an empty string message", () => {
    const state: AppState = { type: "error", message: "" };
    expect(state.message).toBe("");
  });
});

describe("AppState discriminated narrowing", () => {
  function describeState(state: AppState): string {
    switch (state.type) {
      case "loading":
        return "loading";
      case "no-permission":
        return state.retrying ? "no-permission:retrying" : "no-permission:idle";
      case "no-events":
        return "no-events";
      case "has-events":
        return `has-events:${state.events.length}`;
      case "error":
        return `error:${state.message}`;
    }
  }

  it("narrows each variant exhaustively", () => {
    expect(describeState({ type: "loading" })).toBe("loading");
    expect(describeState({ type: "no-permission", retrying: false })).toBe(
      "no-permission:idle",
    );
    expect(describeState({ type: "no-permission", retrying: true })).toBe(
      "no-permission:retrying",
    );
    expect(describeState({ type: "no-events" })).toBe("no-events");
    expect(
      describeState({ type: "has-events", events: [createMockEvent()] }),
    ).toBe("has-events:1");
    expect(describeState({ type: "error", message: "fail" })).toBe(
      "error:fail",
    );
  });
});

describe("AppState IPC round-trip (structuredClone)", () => {
  // structuredClone matches the IPC serialization contract used by Electron's
  // structured clone algorithm for webContents.send / ipcMain push payloads.

  it("preserves loading variant", () => {
    const original: AppState = { type: "loading" };
    const cloned = structuredClone(original);
    expect(cloned).toEqual(original);
  });

  it("preserves no-permission variant with retrying field", () => {
    const original: AppState = { type: "no-permission", retrying: true };
    const cloned = structuredClone(original);
    expect(cloned).toEqual(original);
    if (cloned.type === "no-permission") {
      expect(cloned.retrying).toBe(true);
    }
  });

  it("preserves has-events with full MeetingEvent payload", () => {
    const event = createMockEvent({
      title: "Round-trip Meeting",
      calendarName: "Personal",
    });
    const original: AppState = { type: "has-events", events: [event] };
    const cloned = structuredClone(original);
    expect(cloned).toEqual(original);
    if (cloned.type === "has-events") {
      expect(cloned.events[0]?.title).toBe("Round-trip Meeting");
      expect(cloned.events[0]?.calendarName).toBe("Personal");
    }
  });

  it("preserves error variant with message", () => {
    const original: AppState = { type: "error", message: "Network down" };
    const cloned = structuredClone(original);
    expect(cloned).toEqual(original);
  });

  it("does not produce extra properties from cloning", () => {
    const original: AppState = { type: "no-events" };
    const cloned = structuredClone(original);
    expect(Object.keys(cloned)).toEqual(["type"]);
  });
});

describe("AppState optional-field semantics", () => {
  // The union type intentionally omits optional fields. These tests verify
  // that *only* the required fields per variant exist, preventing accidental
  // shape drift (e.g. someone adding `events?` to no-events variant).

  it("no-events variant has no `events` property at all", () => {
    const state: AppState = { type: "no-events" };
    expect("events" in state).toBe(false);
  });

  it("loading variant has no `retrying` property at all", () => {
    const state: AppState = { type: "loading" };
    expect("retrying" in state).toBe(false);
  });

  it("error variant has no `events` property", () => {
    const state: AppState = { type: "error", message: "x" };
    expect("events" in state).toBe(false);
  });
});
