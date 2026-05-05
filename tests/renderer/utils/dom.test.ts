import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  queryRequiredElement,
  isElementTarget,
} from "../../../src/renderer/utils/dom.js";

describe("queryRequiredElement", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns element when id present and tag matches", () => {
    const div = document.createElement("div");
    div.id = "target";
    document.body.appendChild(div);
    const result = queryRequiredElement("target", HTMLDivElement);
    expect(result).toBe(div);
  });

  it("returns null when id missing", () => {
    const result = queryRequiredElement("missing", HTMLDivElement);
    expect(result).toBeNull();
  });

  it("returns null and warns when tag mismatches", () => {
    const span = document.createElement("span");
    span.id = "wrong-tag";
    document.body.appendChild(span);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = queryRequiredElement("wrong-tag", HTMLDivElement);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("isElementTarget", () => {
  it("returns false for null", () => {
    expect(isElementTarget(null)).toBe(false);
  });

  it("returns false for text nodes", () => {
    const textNode = document.createTextNode("hello");
    expect(isElementTarget(textNode)).toBe(false);
  });

  it("returns true for an element", () => {
    const div = document.createElement("div");
    expect(isElementTarget(div)).toBe(true);
  });

  it("narrows EventTarget so .closest() is callable without cast", () => {
    const parent = document.createElement("section");
    parent.classList.add("container");
    const child = document.createElement("button");
    parent.appendChild(child);
    document.body.appendChild(parent);

    const event = new Event("click");
    Object.defineProperty(event, "target", { value: child, writable: false });

    let matched: Element | null = null;
    if (isElementTarget(event.target)) {
      // No cast needed; type is narrowed to Element.
      matched = event.target.closest(".container");
    }
    expect(matched).toBe(parent);
  });
});
