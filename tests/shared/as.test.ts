import { describe, it, expect } from "vitest";
import { As } from "../../src/shared/utils/as.js";

describe("Object.prototype.As", () => {
  it("casts the receiver to the requested type", () => {
    const raw: unknown = { x: 1 };
    const typed = raw.As<{ x: number }>();
    expect(typed.x).toBe(1);
  });

  it("is non-enumerable on Object.prototype", () => {
    expect(Object.prototype.propertyIsEnumerable("As")).toBe(false);
    expect(Object.keys({ a: 1 })).not.toContain("As");
  });

  it("works on nested double-cast style trust boundaries", () => {
    type Narrow = { stdout: { on: (e: string, cb: () => void) => void } };
    const proc = { stdout: { on: () => undefined }, stderr: { on: () => undefined } };
    const narrow = proc.As<Narrow>();
    expect(typeof narrow.stdout.on).toBe("function");
  });
});

describe("As free function", () => {
  it("casts null and undefined receivers", () => {
    expect(As<string | null>(null)).toBeNull();
    expect(As<number | undefined>(undefined)).toBeUndefined();
  });

  it("works without Object.prototype.As (production-bundle regression)", () => {
    // Rslib can tree-shake bare side-effect installs of as.js when package
    // sideEffects analysis marks modules pure — free-function As must not
    // depend on the prototype method.
    const desc = Object.getOwnPropertyDescriptor(Object.prototype, "As");
    try {
      Reflect.deleteProperty(Object.prototype, "As");
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, "As")).toBe(false);
      const raw: unknown = { ok: true };
      expect(As<{ ok: boolean }>(raw).ok).toBe(true);
    } finally {
      if (desc !== undefined) {
        Object.defineProperty(Object.prototype, "As", desc);
      }
    }
  });
});
