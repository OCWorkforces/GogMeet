import { describe, expect, it } from "vitest";

import { ok, err, type AppResult } from "../../src/shared/result.js";
import { parseJsonObject } from "../../src/shared/parse-json.js";

const passthrough = (v: Record<string, unknown>): AppResult<Record<string, unknown>> => ok(v);

describe("parseJsonObject", () => {
  it("returns validator's value for a valid JSON object", () => {
    const result = parseJsonObject('{"a":1}', "settings", (v) => ok({ doubled: v }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ doubled: { a: 1 } });
    }
  });

  it("rejects a JSON array with 'Expected JSON object'", () => {
    const result = parseJsonObject("[1,2,3]", "settings", passthrough);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      if (result.error.kind === "validation") {
        expect(result.error.message).toBe("Expected JSON object");
        expect(result.error.field).toBe("settings");
      }
    }
  });

  it("rejects null with 'Expected JSON object'", () => {
    const result = parseJsonObject("null", "settings", passthrough);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "validation") {
      expect(result.error.message).toBe("Expected JSON object");
    }
  });

  it("rejects a primitive number with 'Expected JSON object'", () => {
    const result = parseJsonObject("42", "settings", passthrough);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "validation") {
      expect(result.error.message).toBe("Expected JSON object");
    }
  });

  it("rejects malformed JSON with 'Invalid JSON: ...' prefix", () => {
    const result = parseJsonObject("{", "settings", passthrough);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "validation") {
      expect(result.error.message).toMatch(/^Invalid JSON: /);
      expect(result.error.field).toBe("settings");
    }
  });

  it("propagates validator's err unchanged", () => {
    const validatorErr: AppResult<never> = err({
      kind: "validation",
      field: "inner",
      message: "bad shape",
    });
    const result = parseJsonObject('{"a":1}', "outer", () => validatorErr);
    expect(result).toBe(validatorErr);
  });

  it("preserves validator's ok value by identity", () => {
    const out = { sentinel: true };
    const result = parseJsonObject('{"x":1}', "settings", () => ok(out));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(out);
    }
  });

  it("includes the field parameter in the AppError", () => {
    const result = parseJsonObject("not json", "myField", passthrough);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "validation") {
      expect(result.error.field).toBe("myField");
    }
  });
});
