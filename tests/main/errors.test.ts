import { describe, expect, it } from "vitest";

import {
  errFrom,
  formatAppError,
  isAppErrorKind,
  isCalendarNoCalendars,
  isCalendarPermissionDenied,
  isCalendarRuntime,
  isIoError,
  isUnknownError,
  isValidationError,
  type AppError,
} from "../../src/domain/entities/errors.js";
import {
  SWIFT_EXIT_CODES,
  SwiftHelperError,
} from "../../src/main/swift/event-validator.js";

describe("errFrom", () => {
  it("maps Error instances to { kind: 'unknown', message }", () => {
    const result = errFrom(new Error("test"));
    expect(result).toEqual({ kind: "unknown", message: "test" });
  });

  it("maps plain objects with a string message to { kind: 'unknown', message }", () => {
    const result = errFrom({ message: "x" });
    expect(result).toEqual({ kind: "unknown", message: "x" });
  });

  it("maps raw strings to { kind: 'unknown', message }", () => {
    const result = errFrom("plain string");
    expect(result).toEqual({ kind: "unknown", message: "plain string" });
  });

  it("maps null to { kind: 'unknown' } with a fallback message", () => {
    const result = errFrom(null);
    expect(result.kind).toBe("unknown");
    expect((result as { message: string }).message).toBeTruthy();
  });

  it("maps undefined to { kind: 'unknown' } with a fallback message", () => {
    const result = errFrom(undefined);
    expect(result.kind).toBe("unknown");
    expect((result as { message: string }).message).toBeTruthy();
  });

  it("maps numbers via String() coercion", () => {
    const result = errFrom(42);
    expect(result).toEqual({ kind: "unknown", message: "42" });
  });

  it("ignores non-string `message` properties", () => {
    const result = errFrom({ message: 123 });
    expect(result.kind).toBe("unknown");
    // Falls back to String(value)
    expect((result as { message: string }).message).toBe("[object Object]");
  });
});

describe("formatAppError", () => {
  it("formats calendar-permission-denied with both keyword and message", () => {
    const out = formatAppError({
      kind: "calendar-permission-denied",
      message: "no access",
    });
    expect(out.toLowerCase()).toContain("permission");
    expect(out).toContain("no access");
  });

  it("formats calendar-no-calendars", () => {
    const out = formatAppError({
      kind: "calendar-no-calendars",
      message: "empty",
    });
    expect(out.toLowerCase()).toContain("no calendars");
    expect(out).toContain("empty");
  });

  it("includes exit code when present for calendar-runtime", () => {
    const out = formatAppError({
      kind: "calendar-runtime",
      message: "boom",
      exitCode: 4,
    });
    expect(out).toContain("4");
    expect(out).toContain("boom");
    expect(out).toContain("Calendar error");
  });

  it("omits exit code section when absent", () => {
    const out = formatAppError({ kind: "calendar-runtime", message: "boom" });
    expect(out).toContain("boom");
    expect(out).not.toMatch(/\(exit/);
  });

  it("formats calendar-auth and calendar-network", () => {
    expect(
      formatAppError({ kind: "calendar-auth", message: "token expired" }),
    ).toContain("authentication");
    expect(
      formatAppError({ kind: "calendar-network", message: "timeout" }),
    ).toContain("network");
  });

  it("formats validation errors with field name", () => {
    const out = formatAppError({
      kind: "validation",
      field: "openBeforeMinutes",
      message: "out of range",
    });
    expect(out).toContain("openBeforeMinutes");
    expect(out).toContain("out of range");
  });

  it("formats io errors with path", () => {
    const out = formatAppError({
      kind: "io",
      path: "/tmp/foo",
      cause: "ENOENT",
    });
    expect(out).toContain("/tmp/foo");
    expect(out).toContain("ENOENT");
  });

  it("formats unknown errors", () => {
    const out = formatAppError({ kind: "unknown", message: "??" });
    expect(out).toContain("??");
  });
});

describe("type guards", () => {
  it("isAppErrorKind narrows correctly", () => {
    const err: AppError = {
      kind: "validation",
      field: "x",
      message: "bad",
    };
    if (isAppErrorKind(err, "validation")) {
      // Narrowed: field is accessible
      expect(err.field).toBe("x");
    } else {
      throw new Error("expected narrowed validation kind");
    }
  });

  it("isAppErrorKind returns false for non-matching kinds", () => {
    const err: AppError = { kind: "unknown", message: "x" };
    expect(isAppErrorKind(err, "validation")).toBe(false);
    expect(isAppErrorKind(err, "unknown")).toBe(true);
  });

  it("per-variant guards correctly identify each kind", () => {
    expect(
      isCalendarPermissionDenied({
        kind: "calendar-permission-denied",
        message: "x",
      }),
    ).toBe(true);
    expect(
      isCalendarNoCalendars({ kind: "calendar-no-calendars", message: "x" }),
    ).toBe(true);
    expect(isCalendarRuntime({ kind: "calendar-runtime", message: "x" })).toBe(true);
    expect(
      isValidationError({ kind: "validation", field: "f", message: "m" }),
    ).toBe(true);
    expect(isIoError({ kind: "io", path: "/p", cause: "c" })).toBe(true);
    expect(isUnknownError({ kind: "unknown", message: "x" })).toBe(true);

    // Negatives
    expect(isUnknownError({ kind: "calendar-runtime", message: "x" })).toBe(false);
    expect(
      isValidationError({ kind: "calendar-no-calendars", message: "x" }),
    ).toBe(false);
  });
});

describe("SwiftHelperError.toAppError", () => {
  it("maps PERMISSION_DENIED (exit 2) to calendar-permission-denied", () => {
    const e = new SwiftHelperError(
      "permission-denied",
      "denied",
      SWIFT_EXIT_CODES.PERMISSION_DENIED,
      undefined,
    );
    const app = e.toAppError();
    expect(app.kind).toBe("calendar-permission-denied");
    expect(app.message).toBe("denied");
  });

  it("maps NO_CALENDARS (exit 3) to calendar-no-calendars", () => {
    const e = new SwiftHelperError(
      "no-calendars",
      "no cal",
      SWIFT_EXIT_CODES.NO_CALENDARS,
      undefined,
    );
    const app = e.toAppError();
    expect(app.kind).toBe("calendar-no-calendars");
    expect(app.message).toBe("no cal");
  });

  it("maps OTHER (exit 4) to calendar-runtime with exitCode preserved", () => {
    const e = new SwiftHelperError(
      "swift-error",
      "boom",
      SWIFT_EXIT_CODES.OTHER,
      "stderr text",
    );
    const app = e.toAppError();
    expect(app.kind).toBe("calendar-runtime");
    if (app.kind === "calendar-runtime") {
      expect(app.message).toBe("boom");
      expect(app.exitCode).toBe(SWIFT_EXIT_CODES.OTHER);
    }
  });

  it("maps unrecognized exit codes to calendar-runtime with exitCode preserved", () => {
    const e = new SwiftHelperError("unknown", "weird", 99, undefined);
    const app = e.toAppError();
    expect(app.kind).toBe("calendar-runtime");
    if (app.kind === "calendar-runtime") {
      expect(app.exitCode).toBe(99);
    }
  });

  it("maps undefined exit code to calendar-runtime without exitCode field", () => {
    const e = new SwiftHelperError("unknown", "no code", undefined, undefined);
    const app = e.toAppError();
    expect(app.kind).toBe("calendar-runtime");
    if (app.kind === "calendar-runtime") {
      expect(app.exitCode).toBeUndefined();
    }
  });
});
