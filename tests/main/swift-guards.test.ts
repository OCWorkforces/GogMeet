import { describe, it, expect } from "vitest";
import {
  isObjectRecord,
  isExecErrorLike,
  getErrorStderr,
  isStringTupleOfLength,
} from "../../src/main/swift/guards.js";

describe("isObjectRecord", () => {
  it("returns true for plain objects", () => {
    expect(isObjectRecord({})).toBe(true);
    expect(isObjectRecord({ a: 1 })).toBe(true);
    expect(isObjectRecord(new Error("x"))).toBe(true);
  });

  it("returns false for null and primitives", () => {
    expect(isObjectRecord(null)).toBe(false);
    expect(isObjectRecord(undefined)).toBe(false);
    expect(isObjectRecord(0)).toBe(false);
    expect(isObjectRecord("str")).toBe(false);
    expect(isObjectRecord(true)).toBe(false);
  });

  it("returns true for arrays (typeof object, not null)", () => {
    expect(isObjectRecord([])).toBe(true);
  });
});

describe("isExecErrorLike", () => {
  it("accepts any non-null object (Node attaches code/stderr lazily)", () => {
    expect(isExecErrorLike({})).toBe(true);
    expect(isExecErrorLike({ code: 2, stderr: "boom" })).toBe(true);
    expect(isExecErrorLike(Object.assign(new Error("x"), { code: 4 }))).toBe(true);
  });

  it("rejects null and primitives", () => {
    expect(isExecErrorLike(null)).toBe(false);
    expect(isExecErrorLike(undefined)).toBe(false);
    expect(isExecErrorLike("error")).toBe(false);
    expect(isExecErrorLike(42)).toBe(false);
  });
});

describe("getErrorStderr", () => {
  it("returns trimmed non-empty stderr string", () => {
    expect(getErrorStderr({ stderr: "  swift error  " })).toBe("swift error");
    expect(getErrorStderr({ stderr: "fatal" })).toBe("fatal");
  });

  it("returns undefined for empty / whitespace-only stderr", () => {
    expect(getErrorStderr({ stderr: "" })).toBeUndefined();
    expect(getErrorStderr({ stderr: "   \n\t" })).toBeUndefined();
  });

  it("returns undefined when stderr is missing or non-string", () => {
    expect(getErrorStderr({})).toBeUndefined();
    expect(getErrorStderr({ stderr: 42 })).toBeUndefined();
    expect(getErrorStderr({ stderr: null })).toBeUndefined();
    expect(getErrorStderr({ stderr: { not: "a string" } })).toBeUndefined();
  });

  it("returns undefined for non-object inputs", () => {
    expect(getErrorStderr(null)).toBeUndefined();
    expect(getErrorStderr(undefined)).toBeUndefined();
    expect(getErrorStderr("oops")).toBeUndefined();
  });
});

describe("isStringTupleOfLength", () => {
  it("returns true when array length matches exactly", () => {
    expect(isStringTupleOfLength(["a", "b", "c"], 3)).toBe(true);
    expect(isStringTupleOfLength([], 0)).toBe(true);
  });

  it("returns false for length mismatch", () => {
    expect(isStringTupleOfLength(["a"], 2)).toBe(false);
    expect(isStringTupleOfLength(["a", "b", "c"], 2)).toBe(false);
    expect(isStringTupleOfLength([], 1)).toBe(false);
  });

  it("narrows the array so destructuring N elements is type-safe", () => {
    const fields: string[] = "a\tb\tc".split("\t");
    if (isStringTupleOfLength(fields, 3)) {
      const [x, y, z] = fields;
      expect([x, y, z]).toEqual(["a", "b", "c"]);
    } else {
      throw new Error("guard should have passed");
    }
  });
});
