import type { MeetingEvent } from "../../shared/models.js";

/** Number of tab-delimited fields expected per Swift output line. */
const EXPECTED_FIELD_COUNT = 9;

/** Structured exit codes emitted by `googlemeet-events.swift`. Keep in sync. */
export const SWIFT_EXIT_CODES = {
  SUCCESS: 0,
  PERMISSION_DENIED: 2,
  NO_CALENDARS: 3,
  OTHER: 4,
} as const;

export type SwiftErrorKind =
  | "permission-denied"
  | "no-calendars"
  | "swift-error"
  | "unknown";

/** Error thrown by the Swift helper, classified by structured exit code. */
export class SwiftHelperError extends Error {
  readonly kind: SwiftErrorKind;
  readonly exitCode: number | undefined;
  readonly stderr: string | undefined;

  constructor(
    kind: SwiftErrorKind,
    message: string,
    exitCode: number | undefined,
    stderr: string | undefined,
  ) {
    super(message);
    this.name = "SwiftHelperError";
    this.kind = kind;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/** Map a child_process error (with `.code` set to the exit status) to a typed
 * SwiftHelperError. Non-numeric `.code` (e.g. "ENOENT") falls through to
 * "unknown" — the caller should preserve the original error context. */
export function classifySwiftError(err: unknown): SwiftHelperError {
  const e = err as { code?: number | string; stderr?: unknown; message?: unknown };
  const stderr =
    typeof e?.stderr === "string"
      ? e.stderr.trim() || undefined
      : undefined;
  const baseMessage =
    typeof e?.message === "string" && e.message.length > 0
      ? e.message
      : "Swift helper failed";

  if (typeof e?.code === "number") {
    switch (e.code) {
      case SWIFT_EXIT_CODES.PERMISSION_DENIED:
        return new SwiftHelperError(
          "permission-denied",
          "Calendar permission denied. Grant access in System Settings → Privacy & Security → Calendars.",
          e.code,
          stderr,
        );
      case SWIFT_EXIT_CODES.NO_CALENDARS:
        return new SwiftHelperError(
          "no-calendars",
          "No calendars are available to query.",
          e.code,
          stderr,
        );
      case SWIFT_EXIT_CODES.OTHER:
        return new SwiftHelperError(
          "swift-error",
          `Swift helper error: ${stderr ?? baseMessage}`,
          e.code,
          stderr,
        );
      default:
        return new SwiftHelperError(
          "unknown",
          `Swift helper exited with code ${e.code}: ${stderr ?? baseMessage}`,
          e.code,
          stderr,
        );
    }
  }

  return new SwiftHelperError("unknown", baseMessage, undefined, stderr);
}

/** Strip Outlook/Exchange HTML-to-plaintext border artifacts from event notes. */
export function cleanDescription(notes: string): string {
  return notes
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;

      // Outlook text-border: -::~:~::~:~:...:~::-
      if (/^[-~:]+$/.test(trimmed) && trimmed.length > 10) return false;

      // Long separator lines (underscores, dashes, asterisks)
      if (/^[_\-\*]{5,}$/.test(trimmed)) return false;

      // Outlook bordered separators: * ___ * or similar
      if (/^[\*_][\s_\-\*]+[\*_]$/.test(trimmed)) return false;

      return true;
    })
    .join("\n")
    .trim();
}

/** Parse an ISO8601 date string from the Swift helper.
 *
 * The Swift `ISO8601DateFormatter` always emits UTC (e.g.
 * "2026-04-21T14:30:00Z"). Defensive: if the string lacks any timezone marker
 * ('Z' or '+HH:MM' / '-HH:MM' offset), append 'Z' to force UTC interpretation
 * — never re-append if a marker is already present (avoids "...ZZ"). */
function parseIsoUtc(raw: string): Date {
  const trimmed = raw.trim();
  // Detect existing TZ designator: trailing 'Z' or ±HH:MM offset on time portion
  const hasTz = /Z$/i.test(trimmed) || /[+\-]\d{2}:?\d{2}$/.test(trimmed);
  return new Date(hasTz ? trimmed : `${trimmed}Z`);
}

/** Parse tab-delimited output from Swift helper into MeetingEvent[].
 *
 * Strictly requires exactly {@link EXPECTED_FIELD_COUNT} fields per line. Any
 * malformed line is skipped with a warning that includes the actual field
 * count and (truncated) raw line for diagnostics. A summary count of skipped
 * lines is logged at the end. */
export function parseEvents(raw: string): MeetingEvent[] {
  if (!raw) return [];

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const searchEnd = new Date(todayMidnight);
  searchEnd.setDate(searchEnd.getDate() + 2);

  const seen = new Set<string>();
  let skipped = 0;
  const skip = (reason: string, line: string, fieldCount?: number): void => {
    skipped += 1;
    const preview = line.length > 200 ? `${line.slice(0, 200)}…` : line;
    console.warn(`[event-parser] Skipping event: ${reason}`, {
      fieldCount,
      raw: preview,
    });
  };

  const result = raw
    .split("\n")
    .map((line) => line.replace(/[\r\n]+$/u, ""))
    .filter(Boolean)
    .flatMap((line): MeetingEvent[] => {
      const fields = line.split("\t");
      if (fields.length !== EXPECTED_FIELD_COUNT) {
        skip(
          `expected ${EXPECTED_FIELD_COUNT} tab-delimited fields, got ${fields.length}`,
          line,
          fields.length,
        );
        return [];
      }

      const [
        id,
        title,
        startStr,
        endStr,
        urlField,
        calendarName,
        allDayStr,
        emailField,
        notesField,
      ] = fields as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];

      const meetUrl = urlField.trim() || undefined;

      const startDate = parseIsoUtc(startStr);
      const endDate = parseIsoUtc(endStr);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        skip(
          `invalid ISO8601 date(s) start=${JSON.stringify(startStr)} end=${JSON.stringify(endStr)}`,
          line,
          fields.length,
        );
        return [];
      }

      // Guard: only today + tomorrow
      if (startDate < todayMidnight || startDate >= searchEnd) return [];

      // Deduplicate by id
      const uid = id.trim();
      if (seen.has(uid)) return [];
      seen.add(uid);

      return [
        {
          id: uid,
          title: title.trim(),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          ...(meetUrl ? { meetUrl } : {}),
          calendarName: calendarName.trim(),
          isAllDay: allDayStr.trim() === "true",
          ...(emailField?.trim() ? { userEmail: emailField.trim() } : {}),
          ...(notesField?.trim()
            ? { description: cleanDescription(notesField) }
            : {}),
        },
      ];
    })
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

  if (skipped > 0) {
    console.warn(
      `[event-parser] Skipped ${skipped} event${skipped === 1 ? "" : "s"} due to parse errors`,
    );
  }

  return result;
}
