import { describe, it, expect } from "vitest";
import type { Result } from "../../../src/shared/result.js";
import { ok, err } from "../../../src/shared/result.js";

/**
 * Result<T,E> is the discriminated union used by the renderer's brand
 * validators (asEventId, asMeetUrl, asIsoUtc) and by main/settings load.
 * Renderer code consumes Results returned from preload IPC, so the
 * narrowing contract must be stable.
 */
describe("ok()", () => {
  it("returns an object with ok=true and the wrapped value", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(42);
    }
  });

  it("preserves the value's reference identity", () => {
    const obj = { a: 1 };
    const r = ok(obj);
    if (r.ok) {
      expect(r.value).toBe(obj);
    }
  });

  it("wraps undefined and null without throwing", () => {
    const rUndef = ok(undefined);
    const rNull = ok(null);
    expect(rUndef.ok).toBe(true);
    expect(rNull.ok).toBe(true);
    if (rUndef.ok) expect(rUndef.value).toBeUndefined();
    if (rNull.ok) expect(rNull.value).toBeNull();
  });

  it("wraps zero and empty string (falsy values are preserved)", () => {
    const rZero = ok(0);
    const rEmpty = ok("");
    expect(rZero.ok).toBe(true);
    expect(rEmpty.ok).toBe(true);
    if (rZero.ok) expect(rZero.value).toBe(0);
    if (rEmpty.ok) expect(rEmpty.value).toBe("");
  });

  it("wraps complex nested structures", () => {
    const value = { events: [{ id: "1" }, { id: "2" }], meta: { count: 2 } };
    const r = ok(value);
    if (r.ok) {
      expect(r.value.events).toHaveLength(2);
      expect(r.value.meta.count).toBe(2);
    }
  });
});

describe("err()", () => {
  it("returns an object with ok=false and the wrapped error", () => {
    const r = err("oops");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("oops");
    }
  });

  it("preserves Error instance identity (not just message)", () => {
    const e = new Error("boom");
    const r = err(e);
    if (!r.ok) {
      expect(r.error).toBe(e);
      expect(r.error).toBeInstanceOf(Error);
    }
  });

  it("wraps structured error objects", () => {
    const r = err({ code: "ENOENT", path: "/tmp/foo" });
    if (!r.ok) {
      expect(r.error.code).toBe("ENOENT");
      expect(r.error.path).toBe("/tmp/foo");
    }
  });

  it("wraps empty string errors (still ok=false)", () => {
    const r = err("");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("");
    }
  });
});

describe("Result discrimination", () => {
  it("ok and err values are distinguishable by the .ok tag alone", () => {
    const success: Result<number> = ok(1);
    const failure: Result<number> = err("nope");
    expect(success.ok).not.toBe(failure.ok);
  });

  it("type-narrows correctly on .ok=true (value access compiles & runs)", () => {
    const r: Result<string> = ok("hello");
    let narrowed: string | undefined;
    if (r.ok) {
      narrowed = r.value;
    }
    expect(narrowed).toBe("hello");
  });

  it("type-narrows correctly on .ok=false (error access compiles & runs)", () => {
    const r: Result<string> = err("bad");
    let narrowed: string | undefined;
    if (!r.ok) {
      narrowed = r.error;
    }
    expect(narrowed).toBe("bad");
  });

  it("supports chaining via early-return on err", () => {
    function parsePositive(raw: string): Result<number> {
      const n = Number(raw);
      if (!Number.isFinite(n)) return err("not a number");
      if (n <= 0) return err("must be positive");
      return ok(n);
    }

    const r1 = parsePositive("42");
    const r2 = parsePositive("-1");
    const r3 = parsePositive("abc");

    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value).toBe(42);

    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe("must be positive");

    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error).toBe("not a number");
  });

  it("supports custom error type parameter (Result<T, E>)", () => {
    interface ApiError {
      code: number;
      message: string;
    }
    const r: Result<string, ApiError> = err({
      code: 500,
      message: "Server error",
    });
    if (!r.ok) {
      expect(r.error.code).toBe(500);
      expect(r.error.message).toBe("Server error");
    }
  });
});
