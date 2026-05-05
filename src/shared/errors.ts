/**
 * AppError — discriminated union for unified error taxonomy across the codebase.
 *
 * Use with `AppResult<T>` (alias for `Result<T, AppError>`) when an operation
 * has structured failure modes that a caller may want to branch on. For
 * free-form/string errors, keep using `Result<T>` (default `E = string`).
 *
 * Trust boundaries (Swift helper, IPC, FS) should map their native errors into
 * AppError via `errFrom()` or a dedicated `toAppError()` method.
 */
export type AppError =
  | { kind: "swift-permission-denied"; message: string }
  | { kind: "swift-no-calendars"; message: string }
  | { kind: "swift-runtime"; message: string; exitCode?: number }
  | { kind: "validation"; field: string; message: string }
  | { kind: "io"; path: string; cause: string }
  | { kind: "unknown"; message: string };

/** Generic kind-narrowing guard — preferred over hand-rolled per-variant guards. */
export function isAppErrorKind<K extends AppError["kind"]>(
  e: AppError,
  kind: K,
): e is Extract<AppError, { kind: K }> {
  return e.kind === kind;
}

/** Per-variant guards for ergonomic narrowing at use-sites. */
export function isSwiftPermissionDenied(
  e: AppError,
): e is Extract<AppError, { kind: "swift-permission-denied" }> {
  return e.kind === "swift-permission-denied";
}

export function isSwiftNoCalendars(
  e: AppError,
): e is Extract<AppError, { kind: "swift-no-calendars" }> {
  return e.kind === "swift-no-calendars";
}

export function isSwiftRuntime(e: AppError): e is Extract<AppError, { kind: "swift-runtime" }> {
  return e.kind === "swift-runtime";
}

export function isValidationError(e: AppError): e is Extract<AppError, { kind: "validation" }> {
  return e.kind === "validation";
}

export function isIoError(e: AppError): e is Extract<AppError, { kind: "io" }> {
  return e.kind === "io";
}

export function isUnknownError(e: AppError): e is Extract<AppError, { kind: "unknown" }> {
  return e.kind === "unknown";
}

/** Human-readable formatting of an AppError, suitable for logs and UI surfaces. */
export function formatAppError(e: AppError): string {
  switch (e.kind) {
    case "swift-permission-denied":
      return `Calendar permission denied: ${e.message}`;
    case "swift-no-calendars":
      return `No calendars available: ${e.message}`;
    case "swift-runtime": {
      const code = e.exitCode !== undefined ? ` (exit ${e.exitCode})` : "";
      return `Swift helper error${code}: ${e.message}`;
    }
    case "validation":
      return `Validation error on '${e.field}': ${e.message}`;
    case "io":
      return `I/O error at '${e.path}': ${e.cause}`;
    case "unknown":
      return `Unknown error: ${e.message}`;
  }
}

/**
 * Coerce any thrown value into an AppError.
 *
 * Always returns `{ kind: "unknown" }` — callers with structured context
 * (e.g. SwiftHelperError) should prefer their own `toAppError()` mapper before
 * falling back to this helper.
 */
/**
 * Type predicate: narrows an object to one bearing a string `message` property.
 * Justified by preceding 'message' in value check narrowing to { message: unknown };
 * typeof check then confirms string.
 */
function hasStringMessage(value: object): value is { message: string } {
  return "message" in value && typeof (value as { message: unknown }).message === "string";
}

export function errFrom(e: unknown): AppError {
  if (e instanceof Error) {
    return { kind: "unknown", message: e.message };
  }
  if (typeof e === "string") {
    return { kind: "unknown", message: e };
  }
  if (typeof e === "object" && e !== null && hasStringMessage(e)) {
    return { kind: "unknown", message: e.message };
  }
  if (e === undefined || e === null) {
    return { kind: "unknown", message: "Unknown error" };
  }
  try {
    return { kind: "unknown", message: String(e) };
  } catch {
    return { kind: "unknown", message: "Unknown error" };
  }
}
