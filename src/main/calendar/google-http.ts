/**
 * Bounded Google HTTP transport.
 *
 * Safety ceilings (not claimed performance optima):
 * - 15 s per-request deadline covering headers + body
 * - 8 MiB response body ceiling
 * - callers supply an optional upstream AbortSignal (e.g. 60 s poll budget)
 *
 * Does not implement retry loops or credential clearing — those belong to
 * oauth/provider layers.
 */

export const GOOGLE_HTTP_REQUEST_TIMEOUT_MS = 15_000;
export const GOOGLE_HTTP_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
/** Overall poll budget for calendar list + event pages + refresh await. */
export const GOOGLE_POLL_BUDGET_MS = 60_000;

export type GoogleHttpErrorClass =
  | "timeout"
  | "abort"
  | "payload-too-large"
  | "auth"
  | "rate-limit"
  | "server"
  | "protocol"
  | "network";

export class GoogleHttpError extends Error {
  readonly errorClass: GoogleHttpErrorClass;
  /** HTTP status when applicable; never includes response bodies. */
  readonly status: number | undefined;
  /** Redacted OAuth/API error code when parsed from a bounded body. */
  readonly apiErrorCode: string | undefined;

  constructor(
    errorClass: GoogleHttpErrorClass,
    message: string,
    options: { status?: number; apiErrorCode?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "GoogleHttpError";
    this.errorClass = errorClass;
    this.status = options.status;
    this.apiErrorCode = options.apiErrorCode;
  }
}

export interface GoogleHttpRequest {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string | URLSearchParams;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly bodyLimitBytes?: number;
}

export interface GoogleHttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly bodyText: string;
}

function combineSignals(
  timeoutMs: number,
  upstream: AbortSignal | undefined,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new GoogleHttpError("timeout", `Google HTTP timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  timer.unref?.();

  const onUpstream = (): void => {
    controller.abort(
      upstream?.reason instanceof Error
        ? upstream.reason
        : new GoogleHttpError("abort", "Google HTTP aborted"),
    );
  };

  if (upstream) {
    if (upstream.aborted) {
      clearTimeout(timer);
      onUpstream();
    } else {
      upstream.addEventListener("abort", onUpstream, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (upstream) upstream.removeEventListener("abort", onUpstream);
      void timedOut;
    },
  };
}

async function readBodyBounded(
  res: Response,
  limitBytes: number,
  signal: AbortSignal,
): Promise<string> {
  if (res.body === null) {
    // Fallback for environments without streaming body
    const text = await res.text();
    if (text.length > limitBytes) {
      throw new GoogleHttpError(
        "payload-too-large",
        `Google HTTP body exceeded ${limitBytes} bytes`,
      );
    }
    return text;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      if (signal.aborted) {
        throw mapAbortReason(signal.reason);
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limitBytes) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        throw new GoogleHttpError(
          "payload-too-large",
          `Google HTTP body exceeded ${limitBytes} bytes`,
        );
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

function mapAbortReason(reason: unknown): GoogleHttpError {
  if (reason instanceof GoogleHttpError) return reason;
  if (reason instanceof Error && reason.name === "TimeoutError") {
    return new GoogleHttpError("timeout", reason.message, { cause: reason });
  }
  if (reason instanceof Error && /abort/i.test(reason.name)) {
    return new GoogleHttpError("abort", reason.message || "Google HTTP aborted", {
      cause: reason,
    });
  }
  return new GoogleHttpError("abort", "Google HTTP aborted", { cause: reason });
}

/**
 * Parse a bounded OAuth/API error body into a code string only.
 * Never returns raw body text for logging/storage.
 */
export function parseGoogleApiErrorCode(bodyText: string): string | undefined {
  if (bodyText.length === 0 || bodyText.length > 4096) return undefined;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (parsed === null || typeof parsed !== "object") return undefined;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec["error"] === "string") return rec["error"];
    const errObj = rec["error"];
    if (errObj !== null && typeof errObj === "object") {
      const status = (errObj as Record<string, unknown>)["status"];
      if (typeof status === "string") return status;
      const message = (errObj as Record<string, unknown>)["message"];
      if (typeof message === "string" && message.length < 128) return message;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function classifyHttpStatus(status: number, apiErrorCode: string | undefined): GoogleHttpError {
  if (status === 401 || status === 403) {
    return new GoogleHttpError("auth", `Google HTTP auth failure (${status})`, {
      status,
      apiErrorCode,
    });
  }
  if (status === 429) {
    return new GoogleHttpError("rate-limit", "Google HTTP rate limited (429)", {
      status,
      apiErrorCode,
    });
  }
  if (status >= 500) {
    return new GoogleHttpError("server", `Google HTTP server error (${status})`, {
      status,
      apiErrorCode,
    });
  }
  return new GoogleHttpError("protocol", `Google HTTP error (${status})`, {
    status,
    apiErrorCode,
  });
}

/**
 * Perform one bounded Google HTTP request. Returns status + body text on any
 * completed HTTP response (including non-2xx). Transport failures throw
 * GoogleHttpError. Callers decide whether non-2xx is auth vs network.
 */
export async function googleHttpRequest(req: GoogleHttpRequest): Promise<GoogleHttpResponse> {
  const timeoutMs = req.timeoutMs ?? GOOGLE_HTTP_REQUEST_TIMEOUT_MS;
  const bodyLimit = req.bodyLimitBytes ?? GOOGLE_HTTP_BODY_LIMIT_BYTES;
  const { signal, cleanup } = combineSignals(timeoutMs, req.signal);

  try {
    let res: Response;
    try {
      res = await fetch(req.url, {
        method: req.method ?? "GET",
        headers: req.headers,
        body: req.body,
        signal,
      });
    } catch (err) {
      if (err instanceof GoogleHttpError) throw err;
      if (signal.aborted) throw mapAbortReason(signal.reason ?? err);
      if (err instanceof Error && err.name === "AbortError") {
        throw mapAbortReason(err);
      }
      throw new GoogleHttpError(
        "network",
        err instanceof Error ? err.message : "Google HTTP network failure",
        { cause: err },
      );
    }

    const bodyText = await readBodyBounded(res, bodyLimit, signal);
    return { status: res.status, ok: res.ok, bodyText };
  } finally {
    cleanup();
  }
}

/**
 * Convenience: request + JSON parse. Throws GoogleHttpError for transport and
 * non-OK responses (with redacted error class). On success returns parsed JSON.
 */
export async function googleHttpJson(req: GoogleHttpRequest): Promise<unknown> {
  const res = await googleHttpRequest(req);
  if (!res.ok) {
    const code = parseGoogleApiErrorCode(res.bodyText);
    throw classifyHttpStatus(res.status, code);
  }
  try {
    return JSON.parse(res.bodyText) as unknown;
  } catch (err) {
    throw new GoogleHttpError("protocol", "Google HTTP returned invalid JSON", { cause: err });
  }
}

/** Create a deadline AbortSignal for an overall poll budget. */
export function createPollBudgetSignal(
  budgetMs: number = GOOGLE_POLL_BUDGET_MS,
  upstream?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  return combineSignals(budgetMs, upstream);
}
